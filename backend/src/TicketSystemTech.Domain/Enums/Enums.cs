namespace TicketSystemTech.Domain.Enums;

public enum UserRole
{
    Admin = 0,
    Consultant = 1,
    SupportAgent = 2,
    Client = 3
}

public enum TicketStatus
{
    New = 0,
    Open = 1,
    InProgress = 2,
    Resolved = 3,
    Closed = 4
}

public enum TicketSource
{
    Phone = 0,
    Email = 1,
    TicketSystem = 2,
    Other = 3
}

public enum MessageType
{
    Response = 0,
    InternalNote = 1
}

public enum NotificationType
{
    NewTicket = 0,
    TicketAssigned = 1,
    TicketOpened = 2,
    TicketClosed = 3,
    NewResponse = 4,
    SlaDueSoon = 5,
    UserActivatedViaInvite = 6
}
