using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Api.Emails;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api/tickets")]
[Authorize]
public class TicketsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly ITicketNumberGenerator _ticketNumberGenerator;
    private readonly IEmailSender _emailSender;
    private readonly INotificationPublisher _notificationPublisher;
    private readonly IKnowledgeBaseIndexer _knowledgeBaseIndexer;

    public TicketsController(
        AppDbContext db,
        ICurrentUserService currentUser,
        ITicketNumberGenerator ticketNumberGenerator,
        IEmailSender emailSender,
        INotificationPublisher notificationPublisher,
        IKnowledgeBaseIndexer knowledgeBaseIndexer)
    {
        _db = db;
        _currentUser = currentUser;
        _ticketNumberGenerator = ticketNumberGenerator;
        _emailSender = emailSender;
        _notificationPublisher = notificationPublisher;
        _knowledgeBaseIndexer = knowledgeBaseIndexer;
    }

    [HttpPost]
    [Authorize(Roles = nameof(UserRole.Client))]
    public async Task<ActionResult<TicketDetailDto>> Create(CreateTicketRequest request)
    {
        var clientId = _currentUser.UserId!.Value;
        var companyId = _currentUser.CompanyId;
        if (companyId is null)
            return BadRequest(new { message = "Your account is not linked to a company." });

        var ticket = new Ticket
        {
            TicketNumber = await _ticketNumberGenerator.NextAsync(),
            Title = request.Title,
            Description = request.Description,
            ClientId = clientId,
            CompanyId = companyId.Value,
            Status = TicketStatus.New
        };
        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        // New tickets are unrouted (no branch yet), so every staff member across all branches is notified for triage.
        var staff = await _db.Users.Where(u => (u.Role == UserRole.Consultant || u.Role == UserRole.SupportAgent) && u.IsActive).ToListAsync();
        foreach (var member in staff)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = member.Id,
                Type = NotificationType.NewTicket,
                Message = $"New ticket #{ticket.TicketNumber}: {ticket.Title}",
                TicketId = ticket.Id
            });
        }
        await _db.SaveChangesAsync();
        await _notificationPublisher.PushToRoleAsync(UserRole.Consultant, "newTicket", new { ticket.Id, ticket.TicketNumber, ticket.Title });
        await _notificationPublisher.PushToRoleAsync(UserRole.SupportAgent, "newTicket", new { ticket.Id, ticket.TicketNumber, ticket.Title });

        return Ok(await BuildDetailDto(ticket.Id));
    }

    /// <summary>
    /// Staff creates a ticket on behalf of a client who reported the issue verbally (e.g. by phone) rather
    /// than through the client portal. The ticket is created and opened in one step, and appears exactly as
    /// if the client had submitted it themselves.
    /// </summary>
    [HttpPost("on-behalf")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> CreateOnBehalf(CreateTicketOnBehalfRequest request)
    {
        var client = await _db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == request.ClientEmail.ToUpperInvariant() && u.Role == UserRole.Client);
        if (client is null) return NotFound(new { message = "No client account found with that email." });
        if (client.CompanyId is null) return BadRequest(new { message = "This client is not linked to a company." });

        // Non-admin staff can only route a ticket into their own branch; moving it elsewhere later requires an explicit transfer.
        if (_currentUser.Role != UserRole.Admin && request.DepartmentId != _currentUser.DepartmentId)
            return BadRequest(new { message = "You can only open tickets into your own branch." });

        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.AssignedToUserId
            && (u.Role == UserRole.SupportAgent || u.Role == UserRole.Consultant));
        if (assignee is null) return BadRequest(new { message = "Assignee must be a support agent or consultant." });
        if (assignee.DepartmentId != request.DepartmentId)
            return BadRequest(new { message = "Assignee must belong to the selected branch." });

        var ticket = new Ticket
        {
            TicketNumber = await _ticketNumberGenerator.NextAsync(),
            Title = request.Title,
            Description = request.Description,
            ClientId = client.Id,
            CompanyId = client.CompanyId.Value,
            Status = TicketStatus.Open,
            Source = request.Source,
            HelpTopicId = request.HelpTopicId,
            DepartmentId = request.DepartmentId,
            SlaPlanId = request.SlaPlanId,
            Priority = request.Priority,
            DueDateUtc = request.DueDateUtc,
            AssignedToUserId = request.AssignedToUserId,
            OpenedByUserId = _currentUser.UserId,
            OpenedAtUtc = DateTime.UtcNow
        };
        _db.Tickets.Add(ticket);
        _db.TicketAssignees.Add(new TicketAssignee { Ticket = ticket, UserId = assignee.Id });

        var openedBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);
        _db.TicketMessages.Add(new TicketMessage
        {
            Ticket = ticket,
            AuthorId = openedBy.Id,
            Type = MessageType.SystemEvent,
            BodyHtml = $"<p>Ticket opened by {openedBy.FirstName} {openedBy.LastName} and assigned to {assignee.FirstName} {assignee.LastName}.</p>"
        });

        _db.Notifications.Add(new Notification { UserId = assignee.Id, Type = NotificationType.TicketAssigned, Message = $"Ticket #{ticket.TicketNumber} assigned to you", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(client.Email!, $"Your ticket #{ticket.TicketNumber} has been opened", EmailTemplates.TicketOpened(client.FirstName, ticket.TicketNumber));
        await _emailSender.SendAsync(assignee.Email!, $"Ticket #{ticket.TicketNumber} assigned to you", EmailTemplates.TicketAssigned(assignee.FirstName, ticket.TicketNumber, ticket.Title));
        await _notificationPublisher.PushToUserAsync(assignee.Id, "ticketAssigned", new { ticket.Id, ticket.TicketNumber, ticket.Title });

        return Ok(await BuildDetailDto(ticket.Id));
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<TicketListItem>>> List(
        [FromQuery] TicketStatus? status,
        [FromQuery] Guid? companyId,
        [FromQuery] Guid? assignedToUserId,
        [FromQuery] Guid? departmentId,
        [FromQuery] string? search,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortDir,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Tickets.AsNoTracking().AsQueryable();

        query = _currentUser.Role switch
        {
            UserRole.Client => query.Where(t => t.ClientId == _currentUser.UserId),
            UserRole.Admin => query, // Admin sees everything across all branches
            // Branches are isolated: staff see unrouted (New) tickets for triage, plus tickets already routed to their own branch.
            _ => query.Where(t => t.DepartmentId == null || t.DepartmentId == _currentUser.DepartmentId)
        };

        if (status.HasValue) query = query.Where(t => t.Status == status.Value);
        if (companyId.HasValue) query = query.Where(t => t.CompanyId == companyId.Value);
        if (assignedToUserId.HasValue)
            query = query.Where(t => t.AssignedToUserId == assignedToUserId.Value || t.Assignees.Any(a => a.UserId == assignedToUserId.Value));
        if (departmentId.HasValue) query = query.Where(t => t.DepartmentId == departmentId.Value);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.TicketNumber.Contains(search) || t.Title.Contains(search));

        var totalCount = await query.CountAsync();

        var desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        query = (sortBy?.ToLowerInvariant()) switch
        {
            "ticketnumber" => desc ? query.OrderByDescending(t => t.TicketNumber) : query.OrderBy(t => t.TicketNumber),
            "title" => desc ? query.OrderByDescending(t => t.Title) : query.OrderBy(t => t.Title),
            "status" => desc ? query.OrderByDescending(t => t.Status) : query.OrderBy(t => t.Status),
            "priority" => desc ? query.OrderByDescending(t => t.Priority) : query.OrderBy(t => t.Priority),
            "duedate" => desc ? query.OrderByDescending(t => t.DueDateUtc) : query.OrderBy(t => t.DueDateUtc),
            "createdat" => desc ? query.OrderByDescending(t => t.CreatedAt) : query.OrderBy(t => t.CreatedAt),
            "branch" => desc ? query.OrderByDescending(t => t.Department!.Name) : query.OrderBy(t => t.Department!.Name),
            "company" => desc ? query.OrderByDescending(t => t.Company!.Name) : query.OrderBy(t => t.Company!.Name),
            // Default: most urgent first, then soonest SLA due date first — the operational priority order.
            _ => query.OrderBy(t => t.Priority).ThenBy(t => t.DueDateUtc)
        };

        var page_ = await query
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new
            {
                t.Id, t.TicketNumber, t.Title, t.Status, t.Priority, t.CompanyId, t.ClientId, t.AssignedToUserId, t.CreatedAt, t.DueDateUtc, t.ClosedAtUtc, t.DepartmentId
            })
            .ToListAsync();

        var userIds = page_.SelectMany(t => new[] { t.ClientId, t.AssignedToUserId }).Where(id => id.HasValue).Select(id => id!.Value)
            .Concat(page_.Select(t => t.ClientId)).Distinct().ToList();
        var users = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FirstName + " " + u.LastName);
        var companyIds = page_.Select(t => t.CompanyId).Distinct().ToList();
        var companies = await _db.Companies.Where(c => companyIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
        var departmentIds = page_.Where(t => t.DepartmentId.HasValue).Select(t => t.DepartmentId!.Value).Distinct().ToList();
        var departments = await _db.Departments.Where(d => departmentIds.Contains(d.Id)).ToDictionaryAsync(d => d.Id, d => d.Name);

        var items = page_.Select(t => new TicketListItem(
            t.Id, t.TicketNumber, t.Title, t.Status.ToString(), t.Priority?.ToString(),
            companies.GetValueOrDefault(t.CompanyId, ""),
            users.GetValueOrDefault(t.ClientId, ""),
            t.AssignedToUserId.HasValue ? users.GetValueOrDefault(t.AssignedToUserId.Value) : null,
            t.CreatedAt, t.DueDateUtc, t.ClosedAtUtc,
            t.DepartmentId, t.DepartmentId.HasValue ? departments.GetValueOrDefault(t.DepartmentId.Value) : null
        )).ToList();

        return Ok(new PagedResult<TicketListItem>(items, page, pageSize, totalCount));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TicketDetailDto>> GetById(Guid id)
    {
        var ticket = await _db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();

        return Ok(await BuildDetailDto(id));
    }

    [HttpPost("{id:guid}/open")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> OpenTicket(Guid id, OpenTicketRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (ticket.Status != TicketStatus.New) return BadRequest(new { message = "Only new tickets can be opened." });

        // Non-admin staff can only route a ticket into their own branch; moving it elsewhere later requires an explicit transfer.
        if (_currentUser.Role != UserRole.Admin && request.DepartmentId != _currentUser.DepartmentId)
            return BadRequest(new { message = "You can only open tickets into your own branch." });

        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.AssignedToUserId
            && (u.Role == UserRole.SupportAgent || u.Role == UserRole.Consultant));
        if (assignee is null) return BadRequest(new { message = "Assignee must be a support agent or consultant." });
        if (assignee.DepartmentId != request.DepartmentId)
            return BadRequest(new { message = "Assignee must belong to the selected branch." });

        ticket.Source = request.Source;
        ticket.HelpTopicId = request.HelpTopicId;
        ticket.DepartmentId = request.DepartmentId;
        ticket.SlaPlanId = request.SlaPlanId;
        ticket.Priority = request.Priority;
        ticket.DueDateUtc = request.DueDateUtc;
        ticket.AssignedToUserId = request.AssignedToUserId;
        ticket.Status = TicketStatus.Open;
        ticket.OpenedByUserId = _currentUser.UserId;
        ticket.OpenedAtUtc = DateTime.UtcNow;
        _db.TicketAssignees.Add(new TicketAssignee { TicketId = ticket.Id, UserId = assignee.Id });

        var client = await _db.Users.FirstAsync(u => u.Id == ticket.ClientId);
        var openedBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);
        _db.TicketMessages.Add(new TicketMessage
        {
            TicketId = ticket.Id,
            AuthorId = openedBy.Id,
            Type = MessageType.SystemEvent,
            BodyHtml = $"<p>Ticket opened by {openedBy.FirstName} {openedBy.LastName} and assigned to {assignee.FirstName} {assignee.LastName}.</p>"
        });

        _db.Notifications.Add(new Notification { UserId = assignee.Id, Type = NotificationType.TicketAssigned, Message = $"Ticket #{ticket.TicketNumber} assigned to you", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(client.Email!, $"Your ticket #{ticket.TicketNumber} has been opened", EmailTemplates.TicketOpened(client.FirstName, ticket.TicketNumber));
        await _emailSender.SendAsync(assignee.Email!, $"Ticket #{ticket.TicketNumber} assigned to you", EmailTemplates.TicketAssigned(assignee.FirstName, ticket.TicketNumber, ticket.Title));
        await _notificationPublisher.PushToUserAsync(assignee.Id, "ticketAssigned", new { ticket.Id, ticket.TicketNumber, ticket.Title });

        return Ok(await BuildDetailDto(id));
    }

    /// <summary>Moves an already-opened ticket to a different branch. Only staff with access to the ticket's current branch (or Admin) may do this. Notifies everyone in the destination branch.</summary>
    [HttpPost("{id:guid}/transfer-branch")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> TransferBranch(Guid id, TransferTicketBranchRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();
        if (ticket.Status == TicketStatus.New) return BadRequest(new { message = "Open the ticket before transferring it to a branch." });

        var fromDepartment = ticket.DepartmentId.HasValue
            ? await _db.Departments.FirstOrDefaultAsync(d => d.Id == ticket.DepartmentId.Value)
            : null;
        var toDepartment = await _db.Departments.FirstOrDefaultAsync(d => d.Id == request.DepartmentId && d.IsActive);
        if (toDepartment is null) return BadRequest(new { message = "Destination branch not found." });
        if (toDepartment.Id == ticket.DepartmentId) return BadRequest(new { message = "Ticket is already in this branch." });

        var transferredBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);

        ticket.DepartmentId = toDepartment.Id;
        ticket.AssignedToUserId = null; // the previous assignee(s) likely don't belong to the destination branch
        var oldAssignees = await _db.TicketAssignees.Where(a => a.TicketId == ticket.Id).ToListAsync();
        _db.TicketAssignees.RemoveRange(oldAssignees);
        _db.TicketMessages.Add(new TicketMessage
        {
            TicketId = ticket.Id,
            AuthorId = transferredBy.Id,
            Type = MessageType.SystemEvent,
            BodyHtml = $"<p>Ticket transferred from <b>{fromDepartment?.Name ?? "(unrouted)"}</b> to <b>{toDepartment.Name}</b> by {transferredBy.FirstName} {transferredBy.LastName}.</p>"
        });
        await _db.SaveChangesAsync();

        var destinationStaff = await _db.Users
            .Where(u => (u.Role == UserRole.Consultant || u.Role == UserRole.SupportAgent) && u.DepartmentId == toDepartment.Id && u.IsActive)
            .ToListAsync();

        foreach (var member in destinationStaff)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = member.Id,
                Type = NotificationType.TicketTransferred,
                Message = $"Ticket #{ticket.TicketNumber} transferred to {toDepartment.Name}",
                TicketId = ticket.Id
            });
        }
        await _db.SaveChangesAsync();

        foreach (var member in destinationStaff)
        {
            await _emailSender.SendAsync(member.Email!, $"Ticket #{ticket.TicketNumber} transferred to your branch",
                EmailTemplates.TicketTransferred(member.FirstName, ticket.TicketNumber, ticket.Title,
                    fromDepartment?.Name ?? "(unrouted)", toDepartment.Name, $"{transferredBy.FirstName} {transferredBy.LastName}"));
            await _notificationPublisher.PushToUserAsync(member.Id, "ticketTransferred", new { ticket.Id, ticket.TicketNumber, ticket.Title, Branch = toDepartment.Name });
        }

        return Ok(await BuildDetailDto(id));
    }

    [HttpPost("{id:guid}/close")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> CloseTicket(Guid id, CloseTicketRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();
        if (ticket.Status is TicketStatus.New) return BadRequest(new { message = "Ticket must be opened before it can be closed." });
        if (ticket.Status == TicketStatus.Closed) return BadRequest(new { message = "Ticket is already closed." });
        if (string.IsNullOrWhiteSpace(request.ResolutionSummary))
            return BadRequest(new { message = "A resolution summary is required to close a ticket." });

        ticket.Status = TicketStatus.Closed;
        ticket.ResolutionSummary = request.ResolutionSummary;
        ticket.TechnicalNotes = request.TechnicalNotes;
        ticket.ClosedByUserId = _currentUser.UserId;
        ticket.ClosedAtUtc = DateTime.UtcNow;

        var client = await _db.Users.FirstAsync(u => u.Id == ticket.ClientId);
        var closedBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);

        _db.TicketMessages.Add(new TicketMessage
        {
            TicketId = ticket.Id,
            AuthorId = closedBy.Id,
            Type = MessageType.SystemEvent,
            BodyHtml = $"<p>Ticket closed by {closedBy.FirstName} {closedBy.LastName}.</p>"
        });

        _db.Notifications.Add(new Notification { UserId = client.Id, Type = NotificationType.TicketClosed, Message = $"Ticket #{ticket.TicketNumber} has been resolved", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(client.Email!, $"Your ticket #{ticket.TicketNumber} has been resolved",
            EmailTemplates.TicketClosed(client.FirstName, ticket.TicketNumber, $"{closedBy.FirstName} {closedBy.LastName}"));
        await _notificationPublisher.PushToUserAsync(client.Id, "ticketClosed", new { ticket.Id, ticket.TicketNumber });

        await _knowledgeBaseIndexer.IndexTicketAsync(ticket.Id);

        return Ok(await BuildDetailDto(id));
    }

    /// <summary>Adds a co-assignee — e.g. a second person who helped resolve a different part of the same ticket.</summary>
    [HttpPost("{id:guid}/assignees")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> AddAssignee(Guid id, AddTicketAssigneeRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();
        if (ticket.Status is TicketStatus.New or TicketStatus.Closed)
            return BadRequest(new { message = "The ticket must be open to change its assignees." });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId && (u.Role == UserRole.Consultant || u.Role == UserRole.SupportAgent));
        if (user is null) return BadRequest(new { message = "Assignee must be a support agent or consultant." });
        if (user.DepartmentId != ticket.DepartmentId) return BadRequest(new { message = "Assignee must belong to this ticket's branch." });

        var alreadyAssigned = await _db.TicketAssignees.AnyAsync(a => a.TicketId == id && a.UserId == request.UserId);
        if (alreadyAssigned) return BadRequest(new { message = "This person is already assigned to the ticket." });

        _db.TicketAssignees.Add(new TicketAssignee { TicketId = id, UserId = user.Id });

        var addedBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);
        _db.TicketMessages.Add(new TicketMessage
        {
            TicketId = id,
            AuthorId = addedBy.Id,
            Type = MessageType.SystemEvent,
            BodyHtml = $"<p>{user.FirstName} {user.LastName} added as an assignee by {addedBy.FirstName} {addedBy.LastName}.</p>"
        });

        _db.Notifications.Add(new Notification { UserId = user.Id, Type = NotificationType.TicketAssigned, Message = $"Ticket #{ticket.TicketNumber} assigned to you", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(user.Email!, $"Ticket #{ticket.TicketNumber} assigned to you", EmailTemplates.TicketAssigned(user.FirstName, ticket.TicketNumber, ticket.Title));
        await _notificationPublisher.PushToUserAsync(user.Id, "ticketAssigned", new { ticket.Id, ticket.TicketNumber, ticket.Title });

        return Ok(await BuildDetailDto(id));
    }

    [HttpDelete("{id:guid}/assignees/{userId:guid}")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> RemoveAssignee(Guid id, Guid userId)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();

        var assignment = await _db.TicketAssignees.FirstOrDefaultAsync(a => a.TicketId == id && a.UserId == userId);
        if (assignment is null) return NotFound();

        _db.TicketAssignees.Remove(assignment);
        if (ticket.AssignedToUserId == userId)
        {
            var remaining = await _db.TicketAssignees.Where(a => a.TicketId == id && a.UserId != userId).FirstOrDefaultAsync();
            ticket.AssignedToUserId = remaining?.UserId;
        }
        await _db.SaveChangesAsync();

        return Ok(await BuildDetailDto(id));
    }

    /// <summary>Manually logs when work on the ticket started/ended — not tied to any single assignee.</summary>
    [HttpPatch("{id:guid}/work-time")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<TicketDetailDto>> SetWorkTime(Guid id, SetTicketWorkTimeRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();
        if (request.StartedAtUtc.HasValue && request.EndedAtUtc.HasValue && request.EndedAtUtc < request.StartedAtUtc)
            return BadRequest(new { message = "End time cannot be before start time." });

        ticket.WorkStartedAtUtc = request.StartedAtUtc;
        ticket.WorkEndedAtUtc = request.EndedAtUtc;
        await _db.SaveChangesAsync();

        return Ok(await BuildDetailDto(id));
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<ActionResult<TicketMessageDto>> AddMessage(Guid id, AddTicketMessageRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();

        if (request.Type == MessageType.SystemEvent)
            return BadRequest(new { message = "System events are recorded automatically and cannot be posted directly." });
        if (_currentUser.Role == UserRole.Client && request.Type != MessageType.Response)
            return Forbid();

        var message = new TicketMessage
        {
            TicketId = id,
            AuthorId = _currentUser.UserId!.Value,
            Type = request.Type,
            BodyHtml = request.BodyHtml
        };
        _db.TicketMessages.Add(message);
        await _db.SaveChangesAsync();

        if (request.Type == MessageType.Response)
        {
            var recipientId = _currentUser.Role == UserRole.Client ? ticket.AssignedToUserId : ticket.ClientId;
            if (recipientId.HasValue)
            {
                var recipient = await _db.Users.FirstOrDefaultAsync(u => u.Id == recipientId.Value);
                if (recipient is not null)
                {
                    _db.Notifications.Add(new Notification { UserId = recipient.Id, Type = NotificationType.NewResponse, Message = $"New reply on ticket #{ticket.TicketNumber}", TicketId = ticket.Id });
                    await _db.SaveChangesAsync();
                    await _emailSender.SendAsync(recipient.Email!, $"New reply on ticket #{ticket.TicketNumber}", EmailTemplates.NewResponse(recipient.FirstName, ticket.TicketNumber));
                    await _notificationPublisher.PushToUserAsync(recipient.Id, "newResponse", new { ticket.Id, ticket.TicketNumber });
                }
            }
        }

        if (request.Type == MessageType.InternalNote)
        {
            await _knowledgeBaseIndexer.IndexTicketAsync(ticket.Id);
        }

        var author = await _db.Users.FirstAsync(u => u.Id == message.AuthorId);
        return Ok(new TicketMessageDto(message.Id, message.Type.ToString(), message.BodyHtml, message.AuthorId,
            $"{author.FirstName} {author.LastName}", message.CreatedAt, new List<TicketAttachmentDto>()));
    }

    private bool CanAccess(Ticket ticket) => _currentUser.Role switch
    {
        UserRole.Admin => true,
        // Branches are isolated: staff can access unrouted (New) tickets for triage, plus tickets routed to their own branch.
        UserRole.Consultant or UserRole.SupportAgent => ticket.DepartmentId == null || ticket.DepartmentId == _currentUser.DepartmentId,
        UserRole.Client => ticket.ClientId == _currentUser.UserId,
        _ => false
    };

    private async Task<TicketDetailDto> BuildDetailDto(Guid ticketId)
    {
        var t = await _db.Tickets.AsNoTracking()
            .Include(x => x.Company)
            .Include(x => x.HelpTopic)
            .Include(x => x.Department)
            .Include(x => x.SlaPlan)
            .Include(x => x.Attachments)
            .FirstAsync(x => x.Id == ticketId);

        var messages = await _db.TicketMessages.AsNoTracking()
            .Include(m => m.Attachments)
            .Where(m => m.TicketId == ticketId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        // Clients never see InternalNote or SystemEvent entries — only the Response conversation.
        if (_currentUser.Role == UserRole.Client)
            messages = messages.Where(m => m.Type == MessageType.Response).ToList();

        var assignees = await _db.TicketAssignees.AsNoTracking().Where(a => a.TicketId == ticketId).ToListAsync();

        var relevantUserIds = new List<Guid> { t.ClientId };
        if (t.AssignedToUserId.HasValue) relevantUserIds.Add(t.AssignedToUserId.Value);
        relevantUserIds.AddRange(assignees.Select(a => a.UserId));
        relevantUserIds.AddRange(messages.Select(m => m.AuthorId));
        var users = await _db.Users.Where(u => relevantUserIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u);

        string NameOf(Guid userId) => users.TryGetValue(userId, out var u) ? $"{u.FirstName} {u.LastName}" : "";

        var messageDtos = messages.Select(m => new TicketMessageDto(
            m.Id, m.Type.ToString(), m.BodyHtml, m.AuthorId, NameOf(m.AuthorId), m.CreatedAt,
            m.Attachments.Select(a => new TicketAttachmentDto(a.Id, a.FileName, a.FileUrl, a.FileSizeBytes, a.ContentType, a.CreatedAt)).ToList()
        )).ToList();

        var ticketLevelAttachments = t.Attachments.Where(a => a.MessageId == null)
            .Select(a => new TicketAttachmentDto(a.Id, a.FileName, a.FileUrl, a.FileSizeBytes, a.ContentType, a.CreatedAt)).ToList();

        var assigneeDtos = assignees.Select(a => new TicketAssigneeDto(a.UserId, NameOf(a.UserId))).ToList();

        users.TryGetValue(t.ClientId, out var clientUser);

        return new TicketDetailDto(
            t.Id, t.TicketNumber, t.Title, t.Description, t.Status.ToString(),
            t.ClientId, NameOf(t.ClientId), clientUser?.Email, clientUser?.PhoneNumber,
            t.CompanyId, t.Company?.Name ?? "",
            t.Source?.ToString(), t.HelpTopicId, t.HelpTopic?.Name, t.DepartmentId, t.Department?.Name,
            t.SlaPlanId, t.SlaPlan?.Name, t.Priority?.ToString(), t.DueDateUtc, t.AssignedToUserId,
            t.AssignedToUserId.HasValue ? NameOf(t.AssignedToUserId.Value) : null,
            assigneeDtos, t.WorkStartedAtUtc, t.WorkEndedAtUtc,
            t.OpenedAtUtc, t.ClosedAtUtc, t.ResolutionSummary, t.TechnicalNotes, t.CreatedAt,
            ticketLevelAttachments, messageDtos
        );
    }
}
