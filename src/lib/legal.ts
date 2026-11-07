// In-app legal texts. Versioned: bump + record on profile when materially changed.
// NOTE: starter templates — have a lawyer in your country review before production use.
// Full markdown sources live in D:\Books Remade\legal\.

export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";

export const TERMS_TEXT = `TERMS & CONDITIONS (v1.0) — template, requires lawyer review.

1. THE SERVICE
[Business Name] provides PixoBooks: point-of-sale, inventory, customer, staff and accounting software for retail businesses.

2. YOUR ACCOUNT
Provide accurate business and contact details. The first registered user becomes the shop admin and is responsible for all staff accounts, branches, approvals and password resets. Keep passwords confidential; disable accounts of staff who leave promptly.

3. ACCEPTABLE USE
Lawful business purposes only. Do not access other shops' data, circumvent permissions, or disrupt the service. You are responsible for the accuracy of sales, stock, tax and payroll data you record.

4. YOUR DATA
Your business data remains yours — export any time from Settings. Local backups you create live on your own devices and are your responsibility to protect.

5. FEES AND AVAILABILITY
[Describe pricing / free tier, if any.] We aim for high availability without guaranteeing uninterrupted service. The app keeps selling offline and syncs when connectivity returns.

6. LIABILITY
To the maximum extent permitted by law, no liability for indirect or consequential losses. Total liability limited to fees paid in the preceding 12 months.

7. TERMINATION
Stop any time and export your data. We may suspend accounts used in breach of these terms.

8. CHANGES
Material changes are notified in-app; continued use after the effective date constitutes acceptance. The accepted version is recorded on your profile.

9. GOVERNING LAW
Laws of [Country]; disputes in [City] courts.

10. CONTACT
[Support email / phone / WhatsApp]`;

export const PRIVACY_TEXT = `PRIVACY POLICY (v1.0) — template, requires lawyer review.

1. WHO WE ARE
[Business Name], [address], [contact email].

2. DATA WE COLLECT
Account data (name, email, phone/WhatsApp, role, permissions, attendance); business data (catalogue, sales, customers, suppliers, expenses, payroll inputs); technical data (login timestamps, sessions, error logs).

3. WHY WE USE IT
To operate your shop; secure accounts (lockout, reset approvals, audit log); comply with tax, employment and record-keeping law.

4. CONSENT
Registration requires explicit acceptance of the Terms (checkbox, versioned). Staff accounts are created by the shop admin; staff may request correction or deletion via the admin.

5. SHARING
Hosting/processor: Supabase (database, auth, storage, edge functions). No sale of personal data. No sharing except as required by law.

6. RETENTION
Active data retained while the account is active. Deleted records age out of routine backups with retention. Audit logs are append-only for fraud control.

7. YOUR RIGHTS
Access, correction, export and deletion via the shop admin at [contact email]; response within [30] days.

8. SECURITY
Role-based row-level security, admin-only deletes on financial records, hashed credentials, optional local backups.

9. CHANGES
Material changes notified in-app with a new version; re-acceptance recorded on your profile.

10. CONTACT
[email / phone / WhatsApp]`;
