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

        // Notify every consultant that a new ticket needs to be triaged.
        var consultants = await _db.Users.Where(u => u.Role == UserRole.Consultant && u.IsActive).ToListAsync();
        foreach (var consultant in consultants)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = consultant.Id,
                Type = NotificationType.NewTicket,
                Message = $"New ticket #{ticket.TicketNumber}: {ticket.Title}",
                TicketId = ticket.Id
            });
        }
        await _db.SaveChangesAsync();
        await _notificationPublisher.PushToRoleAsync(UserRole.Consultant, "newTicket", new { ticket.Id, ticket.TicketNumber, ticket.Title });

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

        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.AssignedToUserId
            && (u.Role == UserRole.SupportAgent || u.Role == UserRole.Consultant));
        if (assignee is null) return BadRequest(new { message = "Assignee must be a support agent or consultant." });

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
            DueDateUtc = request.DueDateUtc,
            AssignedToUserId = request.AssignedToUserId,
            OpenedByUserId = _currentUser.UserId,
            OpenedAtUtc = DateTime.UtcNow
        };
        _db.Tickets.Add(ticket);

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
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Tickets.AsNoTracking().AsQueryable();

        query = _currentUser.Role switch
        {
            UserRole.Client => query.Where(t => t.ClientId == _currentUser.UserId),
            _ => query // Admin, Consultant, SupportAgent all see everything
        };

        if (status.HasValue) query = query.Where(t => t.Status == status.Value);
        if (companyId.HasValue) query = query.Where(t => t.CompanyId == companyId.Value);
        if (assignedToUserId.HasValue) query = query.Where(t => t.AssignedToUserId == assignedToUserId.Value);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.TicketNumber.Contains(search) || t.Title.Contains(search));

        var totalCount = await query.CountAsync();

        var page_ = await query.OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new
            {
                t.Id, t.TicketNumber, t.Title, t.Status, t.CompanyId, t.ClientId, t.AssignedToUserId, t.CreatedAt, t.DueDateUtc, t.ClosedAtUtc
            })
            .ToListAsync();

        var userIds = page_.SelectMany(t => new[] { t.ClientId, t.AssignedToUserId }).Where(id => id.HasValue).Select(id => id!.Value)
            .Concat(page_.Select(t => t.ClientId)).Distinct().ToList();
        var users = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FirstName + " " + u.LastName);
        var companyIds = page_.Select(t => t.CompanyId).Distinct().ToList();
        var companies = await _db.Companies.Where(c => companyIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);

        var items = page_.Select(t => new TicketListItem(
            t.Id, t.TicketNumber, t.Title, t.Status.ToString(),
            companies.GetValueOrDefault(t.CompanyId, ""),
            users.GetValueOrDefault(t.ClientId, ""),
            t.AssignedToUserId.HasValue ? users.GetValueOrDefault(t.AssignedToUserId.Value) : null,
            t.CreatedAt, t.DueDateUtc, t.ClosedAtUtc
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

        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.AssignedToUserId
            && (u.Role == UserRole.SupportAgent || u.Role == UserRole.Consultant));
        if (assignee is null) return BadRequest(new { message = "Assignee must be a support agent or consultant." });

        ticket.Source = request.Source;
        ticket.HelpTopicId = request.HelpTopicId;
        ticket.DepartmentId = request.DepartmentId;
        ticket.SlaPlanId = request.SlaPlanId;
        ticket.DueDateUtc = request.DueDateUtc;
        ticket.AssignedToUserId = request.AssignedToUserId;
        ticket.Status = TicketStatus.Open;
        ticket.OpenedByUserId = _currentUser.UserId;
        ticket.OpenedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var client = await _db.Users.FirstAsync(u => u.Id == ticket.ClientId);

        _db.Notifications.Add(new Notification { UserId = assignee.Id, Type = NotificationType.TicketAssigned, Message = $"Ticket #{ticket.TicketNumber} assigned to you", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(client.Email!, $"Your ticket #{ticket.TicketNumber} has been opened", EmailTemplates.TicketOpened(client.FirstName, ticket.TicketNumber));
        await _emailSender.SendAsync(assignee.Email!, $"Ticket #{ticket.TicketNumber} assigned to you", EmailTemplates.TicketAssigned(assignee.FirstName, ticket.TicketNumber, ticket.Title));
        await _notificationPublisher.PushToUserAsync(assignee.Id, "ticketAssigned", new { ticket.Id, ticket.TicketNumber, ticket.Title });

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
        await _db.SaveChangesAsync();

        var client = await _db.Users.FirstAsync(u => u.Id == ticket.ClientId);
        var closedBy = await _db.Users.FirstAsync(u => u.Id == _currentUser.UserId);

        _db.Notifications.Add(new Notification { UserId = client.Id, Type = NotificationType.TicketClosed, Message = $"Ticket #{ticket.TicketNumber} has been resolved", TicketId = ticket.Id });
        await _db.SaveChangesAsync();

        await _emailSender.SendAsync(client.Email!, $"Your ticket #{ticket.TicketNumber} has been resolved",
            EmailTemplates.TicketClosed(client.FirstName, ticket.TicketNumber, $"{closedBy.FirstName} {closedBy.LastName}"));
        await _notificationPublisher.PushToUserAsync(client.Id, "ticketClosed", new { ticket.Id, ticket.TicketNumber });

        await _knowledgeBaseIndexer.IndexTicketAsync(ticket.Id);

        return Ok(await BuildDetailDto(id));
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<ActionResult<TicketMessageDto>> AddMessage(Guid id, AddTicketMessageRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();
        if (!CanAccess(ticket)) return Forbid();

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
        UserRole.Consultant => true,
        UserRole.SupportAgent => true,
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

        // Clients never see InternalNote messages.
        if (_currentUser.Role == UserRole.Client)
            messages = messages.Where(m => m.Type == MessageType.Response).ToList();

        var relevantUserIds = new List<Guid> { t.ClientId };
        if (t.AssignedToUserId.HasValue) relevantUserIds.Add(t.AssignedToUserId.Value);
        relevantUserIds.AddRange(messages.Select(m => m.AuthorId));
        var users = await _db.Users.Where(u => relevantUserIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");

        var messageDtos = messages.Select(m => new TicketMessageDto(
            m.Id, m.Type.ToString(), m.BodyHtml, m.AuthorId, users.GetValueOrDefault(m.AuthorId, ""), m.CreatedAt,
            m.Attachments.Select(a => new TicketAttachmentDto(a.Id, a.FileName, a.FileUrl, a.FileSizeBytes, a.ContentType, a.CreatedAt)).ToList()
        )).ToList();

        var ticketLevelAttachments = t.Attachments.Where(a => a.MessageId == null)
            .Select(a => new TicketAttachmentDto(a.Id, a.FileName, a.FileUrl, a.FileSizeBytes, a.ContentType, a.CreatedAt)).ToList();

        return new TicketDetailDto(
            t.Id, t.TicketNumber, t.Title, t.Description, t.Status.ToString(),
            t.ClientId, users.GetValueOrDefault(t.ClientId, ""),
            t.CompanyId, t.Company?.Name ?? "",
            t.Source?.ToString(), t.HelpTopicId, t.HelpTopic?.Name, t.DepartmentId, t.Department?.Name,
            t.SlaPlanId, t.SlaPlan?.Name, t.DueDateUtc, t.AssignedToUserId,
            t.AssignedToUserId.HasValue ? users.GetValueOrDefault(t.AssignedToUserId.Value) : null,
            t.OpenedAtUtc, t.ClosedAtUtc, t.ResolutionSummary, t.TechnicalNotes, t.CreatedAt,
            ticketLevelAttachments, messageDtos
        );
    }
}
