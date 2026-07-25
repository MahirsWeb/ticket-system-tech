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

    [HttpGet("companies")]
    public async Task<ActionResult<List<LookupItem>>> GetCompanies()
    {
        var items = await _db.Companies.Where(c => c.IsActive).OrderBy(c => c.Name)
            .Select(c => new LookupItem(c.Id, c.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpPost("companies")]
    [Authorize(Roles = $"{nameof(UserRole.Admin)},{nameof(UserRole.Consultant)}")]
    public async Task<ActionResult<LookupItem>> CreateCompany(CreateCompanyRequest request)
    {
        var company = new Company { Name = request.Name, Address = request.Address, ContactInfo = request.ContactInfo };
        _db.Companies.Add(company);
        await _db.SaveChangesAsync();
        return Ok(new LookupItem(company.Id, company.Name));
    }

    [HttpGet("departments")]
    public async Task<ActionResult<List<LookupItem>>> GetDepartments()
    {
        var items = await _db.Departments.Where(d => d.IsActive).OrderBy(d => d.Name)
            .Select(d => new LookupItem(d.Id, d.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpGet("help-topics")]
    public async Task<ActionResult<List<LookupItem>>> GetHelpTopics()
    {
        var items = await _db.HelpTopics.Where(h => h.IsActive).OrderBy(h => h.Name)
            .Select(h => new LookupItem(h.Id, h.Name)).ToListAsync();
        return Ok(items);
    }

    [HttpGet("sla-plans")]
    public async Task<ActionResult<List<SlaPlanItem>>> GetSlaPlans()
    {
        var items = await _db.SlaPlans.Where(s => s.IsActive).OrderBy(s => s.ResolutionTimeHours)
            .Select(s => new SlaPlanItem(s.Id, s.Name, s.ResponseTimeHours, s.ResolutionTimeHours)).ToListAsync();
        return Ok(items);
    }
}
