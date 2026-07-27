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

        if (isAdmin)
        {
            var full = await query.OrderBy(d => d.Name).Select(d => new LookupItemFull(d.Id, d.Name, d.IsActive)).ToListAsync();
            return Ok(full);
        }
        var items = await query.OrderBy(d => d.Name).Select(d => new LookupItem(d.Id, d.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("departments")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<LookupItemFull>> CreateDepartment(NameOnlyRequest request)
    {
        var entity = new Department { Name = request.Name };
        _db.Departments.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(new LookupItemFull(entity.Id, entity.Name, entity.IsActive));
    }

    [HttpPut("departments/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult<LookupItemFull>> UpdateDepartment(Guid id, UpdateNameRequest request)
    {
        var entity = await _db.Departments.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Name = request.Name;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new LookupItemFull(entity.Id, entity.Name, entity.IsActive));
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
