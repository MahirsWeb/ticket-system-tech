using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Api.Emails;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Application.Common.Options;
using TicketSystemTech.Infrastructure.Identity;

namespace TicketSystemTech.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;
    private readonly IEmailSender _emailSender;
    private readonly FrontendOptions _frontendOptions;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        ITokenService tokenService,
        IEmailSender emailSender,
        IOptions<FrontendOptions> frontendOptions)
    {
        _userManager = userManager;
        _tokenService = tokenService;
        _emailSender = emailSender;
        _frontendOptions = frontendOptions.Value;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive || !await _userManager.CheckPasswordAsync(user, request.Password))
            return Unauthorized(new { message = "Invalid email or password." });

        if (user.MustChangePassword)
        {
            if (user.TemporaryPasswordExpiresAtUtc is null || user.TemporaryPasswordExpiresAtUtc < DateTime.UtcNow)
            {
                return Unauthorized(new
                {
                    code = "TEMP_PASSWORD_EXPIRED",
                    message = "Your temporary password has expired. Ask an admin or consultant to generate a new one."
                });
            }

            return Ok(new LoginResponse(true, null, null, null));
        }

        if (user.Role == Domain.Enums.UserRole.Client && !user.EmailConfirmed)
        {
            return StatusCode(403, new { code = "EMAIL_NOT_VERIFIED", message = "Please verify your email address before logging in." });
        }

        var (token, expiresAt) = _tokenService.GenerateAccessToken(user.Id, user.Email!, user.FirstName, user.LastName, user.Role, user.CompanyId);

        user.LastLoginAtUtc = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        return Ok(new LoginResponse(false, token, expiresAt, ToSummary(user)));
    }

    [HttpPost("set-new-password")]
    public async Task<IActionResult> SetNewPassword(SetNewPasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmNewPassword)
            return BadRequest(new { message = "New password and confirmation do not match." });

        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.MustChangePassword)
            return BadRequest(new { message = "Invalid request." });

        if (user.TemporaryPasswordExpiresAtUtc is null || user.TemporaryPasswordExpiresAtUtc < DateTime.UtcNow)
            return BadRequest(new { code = "TEMP_PASSWORD_EXPIRED", message = "Your temporary password has expired." });

        var changeResult = await _userManager.ChangePasswordAsync(user, request.TemporaryPassword, request.NewPassword);
        if (!changeResult.Succeeded)
            return BadRequest(new { message = string.Join(" ", changeResult.Errors.Select(e => e.Description)) });

        user.MustChangePassword = false;
        user.TemporaryPasswordExpiresAtUtc = null;
        await _userManager.UpdateAsync(user);

        // Employees are trusted on creation and skip email verification; only clients need to verify.
        if (user.Role == Domain.Enums.UserRole.Client && !user.EmailConfirmed)
        {
            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var link = $"{_frontendOptions.BaseUrl}/verify-email?userId={user.Id}&token={Uri.EscapeDataString(token)}";
            await _emailSender.SendAsync(user.Email!, "Please verify your email address",
                EmailTemplates.VerifyEmail(user.FirstName, link));

            return Ok(new { message = "Password set. Please check your email to verify your account before logging in." });
        }

        return Ok(new { message = "Password set successfully. You can now log in." });
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(VerifyEmailRequest request)
    {
        var user = await _userManager.FindByIdAsync(request.UserId.ToString());
        if (user is null)
            return BadRequest(new { message = "Invalid verification link." });

        var result = await _userManager.ConfirmEmailAsync(user, request.Token);
        if (!result.Succeeded)
            return BadRequest(new { message = "This verification link is invalid or has expired." });

        return Ok(new { message = "Email verified. You can now log in." });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is not null && user.IsActive)
        {
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var link = $"{_frontendOptions.BaseUrl}/reset-password?userId={user.Id}&token={Uri.EscapeDataString(token)}";
            await _emailSender.SendAsync(user.Email!, "Reset your password",
                EmailTemplates.ForgotPassword(user.FirstName, link));
        }

        // Always return 200 so we don't leak which emails are registered.
        return Ok(new { message = "If that email exists in our system, a reset link has been sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        if (request.NewPassword != request.ConfirmNewPassword)
            return BadRequest(new { message = "New password and confirmation do not match." });

        var user = await _userManager.FindByIdAsync(request.UserId.ToString());
        if (user is null)
            return BadRequest(new { message = "Invalid or expired reset link." });

        var result = await _userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });

        return Ok(new { message = "Password reset successfully. You can now log in." });
    }

    private static UserSummary ToSummary(ApplicationUser user) => new(
        user.Id, user.FirstName, user.LastName, user.Email!, user.Role.ToString(),
        user.CompanyId, user.PhoneNumber, user.PhoneNumberPrompted);
}
