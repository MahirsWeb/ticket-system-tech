using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Api.Emails;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Application.Common.Options;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Identity;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly ITemporaryPasswordGenerator _tempPasswordGenerator;
    private readonly TemporaryPasswordOptions _tempPasswordOptions;
    private readonly IEmailSender _emailSender;
    private readonly FrontendOptions _frontendOptions;

    public UsersController(
        UserManager<ApplicationUser> userManager,
        AppDbContext db,
        ICurrentUserService currentUser,
        ITemporaryPasswordGenerator tempPasswordGenerator,
        IOptions<TemporaryPasswordOptions> tempPasswordOptions,
        IEmailSender emailSender,
        IOptions<FrontendOptions> frontendOptions)
    {
        _userManager = userManager;
        _db = db;
        _currentUser = currentUser;
        _tempPasswordGenerator = tempPasswordGenerator;
        _tempPasswordOptions = tempPasswordOptions.Value;
        _emailSender = emailSender;
        _frontendOptions = frontendOptions.Value;
    }

    /// <summary>Admin-only: create Admin/Consultant/SupportAgent accounts.</summary>
    [HttpPost("employees")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<CreatedUserResponse>> CreateEmployee(CreateEmployeeRequest request)
    {
        if (request.Role == UserRole.Client)
            return BadRequest(new { message = "Use POST /api/users/clients to create client accounts." });

        if (request.Role is UserRole.Consultant or UserRole.SupportAgent)
        {
            if (request.DepartmentId is null)
                return BadRequest(new { message = "A branch must be selected for Consultant and Support Agent accounts." });
            var departmentExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId.Value && d.IsActive);
            if (!departmentExists)
                return BadRequest(new { message = "Branch not found." });
        }

        return await CreateUserInternal(request.FirstName, request.LastName, request.Email, request.Role, companyId: null,
            departmentId: request.Role is UserRole.Consultant or UserRole.SupportAgent ? request.DepartmentId : null);
    }

    /// <summary>Admin or staff (Consultant/SupportAgent): create a Client account tied to an existing company.</summary>
    [HttpPost("clients")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<CreatedUserResponse>> CreateClient(CreateClientRequest request)
    {
        var companyExists = await _db.Companies.AnyAsync(c => c.Id == request.CompanyId);
        if (!companyExists)
            return BadRequest(new { message = "Company not found." });

        return await CreateUserInternal(request.FirstName, request.LastName, request.Email, UserRole.Client, request.CompanyId, departmentId: null);
    }

    /// <summary>Regenerates a fresh short-lived temporary password (e.g. if the previous one expired unused).</summary>
    [HttpPost("{id:guid}/regenerate-temp-password")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<CreatedUserResponse>> RegenerateTempPassword(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();

        // Only Admin may reset another employee's password; non-admin staff may only reset Client passwords.
        if (_currentUser.Role != UserRole.Admin && user.Role != UserRole.Client)
            return Forbid();

        var tempPassword = _tempPasswordGenerator.Generate();
        var removeResult = await _userManager.RemovePasswordAsync(user);
        if (!removeResult.Succeeded)
            return BadRequest(new { message = "Could not reset password." });

        var addResult = await _userManager.AddPasswordAsync(user, tempPassword);
        if (!addResult.Succeeded)
            return BadRequest(new { message = string.Join(" ", addResult.Errors.Select(e => e.Description)) });

        user.MustChangePassword = true;
        user.TemporaryPasswordExpiresAtUtc = DateTime.UtcNow.AddMinutes(_tempPasswordOptions.ValidityMinutes);
        await _userManager.UpdateAsync(user);

        await _emailSender.SendAsync(user.Email!, "Your new temporary password — Ticket System Tech",
            EmailTemplates.Invite(user.FirstName, user.Email!, tempPassword, _tempPasswordOptions.ValidityMinutes, $"{_frontendOptions.BaseUrl}/login"));

        return Ok(new CreatedUserResponse(user.Id, user.Email!, tempPassword, user.TemporaryPasswordExpiresAtUtc.Value));
    }

    /// <summary>Admin-only: (re)assign the branch a Consultant/SupportAgent belongs to.</summary>
    [HttpPatch("{id:guid}/department")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> SetDepartment(Guid id, SetUserDepartmentRequest request)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        if (user.Role is not (UserRole.Consultant or UserRole.SupportAgent))
            return BadRequest(new { message = "Only Consultant and Support Agent accounts belong to a branch." });

        if (request.DepartmentId.HasValue)
        {
            var departmentExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId.Value && d.IsActive);
            if (!departmentExists) return BadRequest(new { message = "Branch not found." });
        }

        user.DepartmentId = request.DepartmentId;
        await _userManager.UpdateAsync(user);
        return Ok();
    }

    [HttpGet]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<List<UserListItem>>> List([FromQuery] UserRole? role, [FromQuery] Guid? companyId, [FromQuery] Guid? departmentId)
    {
        var query = _userManager.Users.AsQueryable();
        if (role.HasValue) query = query.Where(u => u.Role == role.Value);
        if (companyId.HasValue) query = query.Where(u => u.CompanyId == companyId.Value);
        if (departmentId.HasValue) query = query.Where(u => u.DepartmentId == departmentId.Value);

        // Branches are isolated: non-admin staff only see staff members from their own branch. Clients are shared across branches.
        if (_currentUser.Role != UserRole.Admin)
        {
            query = query.Where(u => u.Role == UserRole.Client || u.DepartmentId == _currentUser.DepartmentId);
        }

        var users = await query.OrderBy(u => u.FirstName).ToListAsync();
        var companyNames = await _db.Companies.ToDictionaryAsync(c => c.Id, c => c.Name);
        var departmentNames = await _db.Departments.ToDictionaryAsync(d => d.Id, d => d.Name);

        var result = users.Select(u => new UserListItem(
            u.Id, u.FirstName, u.LastName, u.Email!, u.Role.ToString(),
            u.CompanyId, u.CompanyId.HasValue && companyNames.TryGetValue(u.CompanyId.Value, out var n) ? n : null,
            u.PhoneNumber, u.IsActive, u.EmailConfirmed, u.CreatedAtUtc,
            u.DepartmentId, u.DepartmentId.HasValue && departmentNames.TryGetValue(u.DepartmentId.Value, out var dn) ? dn : null)).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Looks up a Client account by email so staff can pre-fill their info when opening a ticket
    /// on behalf of a client who called/reported the issue verbally (not through the client portal).
    /// </summary>
    [HttpGet("lookup-by-email")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<ClientLookupResult>> LookupByEmail([FromQuery] string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return BadRequest(new { message = "Email is required." });

        var user = await _userManager.FindByEmailAsync(email);
        if (user is null || user.Role != UserRole.Client)
            return NotFound(new { message = "No client account found with that email." });

        var companyName = user.CompanyId.HasValue
            ? await _db.Companies.Where(c => c.Id == user.CompanyId).Select(c => c.Name).FirstOrDefaultAsync()
            : null;

        return Ok(new ClientLookupResult(user.Id, user.FirstName, user.LastName, user.Email!, user.PhoneNumber, user.CompanyId, companyName));
    }

    [HttpPatch("me/phone")]
    [Authorize(Roles = nameof(UserRole.Client))]
    public async Task<IActionResult> SetMyPhone(SetPhoneNumberRequest request)
    {
        if (_currentUser.UserId is null) return Unauthorized();
        var user = await _userManager.FindByIdAsync(_currentUser.UserId.Value.ToString());
        if (user is null) return Unauthorized();

        user.PhoneNumber = request.PhoneNumber;
        user.PhoneNumberPrompted = true;
        await _userManager.UpdateAsync(user);
        return Ok(new { message = "Phone number saved." });
    }

    [HttpPost("me/skip-phone-prompt")]
    [Authorize(Roles = nameof(UserRole.Client))]
    public async Task<IActionResult> SkipPhonePrompt()
    {
        if (_currentUser.UserId is null) return Unauthorized();
        var user = await _userManager.FindByIdAsync(_currentUser.UserId.Value.ToString());
        if (user is null) return Unauthorized();

        user.PhoneNumberPrompted = true;
        await _userManager.UpdateAsync(user);
        return Ok();
    }

    private async Task<ActionResult<CreatedUserResponse>> CreateUserInternal(string firstName, string lastName, string email, UserRole role, Guid? companyId, Guid? departmentId)
    {
        var existing = await _userManager.FindByEmailAsync(email);
        if (existing is not null)
            return Conflict(new { message = "A user with this email already exists." });

        var tempPassword = _tempPasswordGenerator.Generate();
        var expiresAt = DateTime.UtcNow.AddMinutes(_tempPasswordOptions.ValidityMinutes);

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            Role = role,
            CompanyId = companyId,
            DepartmentId = departmentId,
            IsActive = true,
            MustChangePassword = true,
            TemporaryPasswordExpiresAtUtc = expiresAt,
            // Employees are provisioned by a trusted admin; only clients go through email verification.
            EmailConfirmed = role != UserRole.Client
        };

        var result = await _userManager.CreateAsync(user, tempPassword);
        if (!result.Succeeded)
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });

        await _emailSender.SendAsync(email, "You've been invited to Ticket System Tech",
            EmailTemplates.Invite(firstName, email, tempPassword, _tempPasswordOptions.ValidityMinutes, $"{_frontendOptions.BaseUrl}/login"));

        return Ok(new CreatedUserResponse(user.Id, email, tempPassword, expiresAt));
    }
}
