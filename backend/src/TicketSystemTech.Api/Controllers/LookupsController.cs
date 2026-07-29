using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Domain.Entities;
using TicketSystemTech.Domain.Enums;
using TicketSystemTech.Infrastructure.Persistence;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class LookupsController : ControllerBase
{
    private readonly AppDbContext _db;

    public LookupsController(AppDbContext db)
    {
        _db = db;
    }

    // ---------------- Companies ----------------

    [HttpGet("companies")]
    public async Task<ActionResult<List<LookupItem>>> GetCompanies()
    {
        var items = await _db.Companies.Where(c => c.IsActive).OrderBy(c => c.Name)
            .Select(c => new LookupItem(c.Id, c.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("companies")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
    public async Task<ActionResult<LookupItem>> CreateCompany(CreateCompanyRequest request)
    {
        var company = new Company { Name = request.Name, Address = request.Address, ContactInfo = request.ContactInfo };
        _db.Companies.Add(company);
        await _db.SaveChangesAsync();
        return Ok(new LookupItem(company.Id, company.Name));
    }

    // ---------------- Departments ----------------

    [HttpGet("departments")]
    public async Task<ActionResult<List<object>>> GetDepartments([FromQuery] bool includeInactive = false)
    {
        var isAdmin = User.IsInRole(nameof(UserRole.Admin));
        var query = _db.Departments.AsQueryable();
        if (!includeInactive || !isAdmin) query = query.Where(d => d.IsActive);

        // Every authenticated user may see branch names + emails (needed to display "your branch", pick a transfer target, etc.).
        var full = await query.OrderBy(d => d.Name).Select(d => new DepartmentItemFull(d.Id, d.Name, d.Email, d.IsActive)).ToListAsync();
        return Ok(full);
    }

    [HttpPost("departments")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<DepartmentItemFull>> CreateDepartment(CreateDepartmentRequest request)
    {
        var emailTaken = await _db.Departments.AnyAsync(d => d.Email == request.Email);
        if (emailTaken) return Conflict(new { message = "A branch with this email already exists." });

        var entity = new Department { Name = request.Name, Email = request.Email };
        _db.Departments.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(new DepartmentItemFull(entity.Id, entity.Name, entity.Email, entity.IsActive));
    }

    [HttpPut("departments/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<DepartmentItemFull>> UpdateDepartment(Guid id, UpdateDepartmentRequest request)
    {
        var entity = await _db.Departments.FindAsync(id);
        if (entity is null) return NotFound();

        var emailTaken = await _db.Departments.AnyAsync(d => d.Email == request.Email && d.Id != id);
        if (emailTaken) return Conflict(new { message = "A branch with this email already exists." });

        entity.Name = request.Name;
        entity.Email = request.Email;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new DepartmentItemFull(entity.Id, entity.Name, entity.Email, entity.IsActive));
    }

    // ---------------- Sub-branches ----------------

    /// <summary>Every authenticated user may list a branch's sub-branches — needed to populate the required sub-branch picker when opening tickets or assigning employees.</summary>
    [HttpGet("departments/{departmentId:guid}/sub-branches")]
    public async Task<ActionResult<List<SubBranchItemFull>>> GetSubBranches(Guid departmentId, [FromQuery] bool includeInactive = false)
    {
        var isAdmin = User.IsInRole(nameof(UserRole.Admin));
        var query = _db.SubBranches.Where(s => s.DepartmentId == departmentId);
        if (!includeInactive || !isAdmin) query = query.Where(s => s.IsActive);

        var items = await query.OrderBy(s => s.Name)
            .Select(s => new SubBranchItemFull(s.Id, s.Name, s.IsActive, s.DepartmentId)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("departments/{departmentId:guid}/sub-branches")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<SubBranchItemFull>> CreateSubBranch(Guid departmentId, CreateSubBranchRequest request)
    {
        var departmentExists = await _db.Departments.AnyAsync(d => d.Id == departmentId);
        if (!departmentExists) return NotFound(new { message = "Branch not found." });

        var nameTaken = await _db.SubBranches.AnyAsync(s => s.DepartmentId == departmentId && s.Name == request.Name);
        if (nameTaken) return Conflict(new { message = "This branch already has a sub-branch with that name." });

        var entity = new SubBranch { DepartmentId = departmentId, Name = request.Name };
        _db.SubBranches.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(new SubBranchItemFull(entity.Id, entity.Name, entity.IsActive, entity.DepartmentId));
    }

    [HttpPut("sub-branches/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<SubBranchItemFull>> UpdateSubBranch(Guid id, UpdateSubBranchRequest request)
    {
        var entity = await _db.SubBranches.FindAsync(id);
        if (entity is null) return NotFound();

        var nameTaken = await _db.SubBranches.AnyAsync(s => s.DepartmentId == entity.DepartmentId && s.Name == request.Name && s.Id != id);
        if (nameTaken) return Conflict(new { message = "This branch already has a sub-branch with that name." });

        entity.Name = request.Name;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new SubBranchItemFull(entity.Id, entity.Name, entity.IsActive, entity.DepartmentId));
    }

    // ---------------- Help Topics ----------------

    [HttpGet("help-topics")]
    public async Task<ActionResult<List<object>>> GetHelpTopics([FromQuery] bool includeInactive = false)
    {
        var isAdmin = User.IsInRole(nameof(UserRole.Admin));
        var query = _db.HelpTopics.AsQueryable();
        if (!includeInactive || !isAdmin) query = query.Where(h => h.IsActive);

        if (isAdmin)
        {
            var full = await query.OrderBy(h => h.Name).Select(h => new LookupItemFull(h.Id, h.Name, h.IsActive)).ToListAsync();
            return Ok(full);
        }
        var items = await query.OrderBy(h => h.Name).Select(h => new LookupItem(h.Id, h.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("help-topics")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<LookupItemFull>> CreateHelpTopic(NameOnlyRequest request)
    {
        var entity = new HelpTopic { Name = request.Name };
        _db.HelpTopics.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(new LookupItemFull(entity.Id, entity.Name, entity.IsActive));
    }

    [HttpPut("help-topics/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<LookupItemFull>> UpdateHelpTopic(Guid id, UpdateNameRequest request)
    {
        var entity = await _db.HelpTopics.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Name = request.Name;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new LookupItemFull(entity.Id, entity.Name, entity.IsActive));
    }

    // ---------------- SLA Plans ----------------

    [HttpGet("sla-plans")]
    public async Task<ActionResult<List<object>>> GetSlaPlans([FromQuery] bool includeInactive = false)
    {
        var isAdmin = User.IsInRole(nameof(UserRole.Admin));
        var query = _db.SlaPlans.AsQueryable();
        if (!includeInactive || !isAdmin) query = query.Where(s => s.IsActive);

        if (isAdmin)
        {
            var full = await query.OrderBy(s => s.ResolutionTimeHours)
                .Select(s => new SlaPlanItemFull(s.Id, s.Name, s.ResponseTimeHours, s.ResolutionTimeHours, s.IsActive)).ToListAsync();
            return Ok(full);
        }
        var items = await query.OrderBy(s => s.ResolutionTimeHours)
            .Select(s => new SlaPlanItem(s.Id, s.Name, s.ResponseTimeHours, s.ResolutionTimeHours)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("sla-plans")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<SlaPlanItemFull>> CreateSlaPlan(CreateSlaPlanRequest request)
    {
        var entity = new SlaPlan { Name = request.Name, ResponseTimeHours = request.ResponseTimeHours, ResolutionTimeHours = request.ResolutionTimeHours };
        _db.SlaPlans.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(new SlaPlanItemFull(entity.Id, entity.Name, entity.ResponseTimeHours, entity.ResolutionTimeHours, entity.IsActive));
    }

    [HttpPut("sla-plans/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<SlaPlanItemFull>> UpdateSlaPlan(Guid id, UpdateSlaPlanRequest request)
    {
        var entity = await _db.SlaPlans.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Name = request.Name;
        entity.ResponseTimeHours = request.ResponseTimeHours;
        entity.ResolutionTimeHours = request.ResolutionTimeHours;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new SlaPlanItemFull(entity.Id, entity.Name, entity.ResponseTimeHours, entity.ResolutionTimeHours, entity.IsActive));
    }
}
