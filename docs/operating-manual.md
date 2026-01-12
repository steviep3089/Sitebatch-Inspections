# Sitebatch Inspections Portal – Operating Manual (Draft)

## 1. Introduction

This manual explains how to use the Sitebatch Inspections web portal. It is aimed at everyday users (inspectors, administrators, supervisors) rather than developers.

Where you see `Screenshot: ...` you can capture a screen from the live system and paste it into this document (Word, PDF, or your own wiki) to match the caption.

---

## 2. Accessing the Portal

### 2.1 Login
- Navigate to the portal URL in your browser.
- Enter your email address and password.
- Click **Sign In**.
- If your password has expired or you are coming from a reset link, you will be redirected to **Change Password**.

`Screenshot: Login screen with email/password fields`

### 2.2 Change Password
- Used when:
  - You followed a password recovery email link, or
  - You are forced to change your password after signup/recovery.
- Enter and confirm your new password, then submit.
- After a successful change you are returned to the main portal.

`Screenshot: Change Password screen`

---

## 3. Layout and Navigation

After login, the layout is:

- **Header bar** (top):
  - Portal title/logo.
  - Navigation links to the main pages (Overview, Plant, Inspections, My Checklists, Events, Users, Admin, etc.).
  - User menu / sign-out.
- **Main content area** (centre):
  - Shows the currently selected page.

`Screenshot: Header and main navigation`

---

## 4. Overview (Asset Overview)

Menu: **Overview**  
Component: `AssetOverview`

Purpose:
- Give a high-level view of assets and their inspection status.

Typical functions:
- See which assets have upcoming or overdue inspections.
- Drill into a specific asset to see more detail and timelines.

`Screenshot: Overview page highlighting asset cards / status`

---

## 5. Plant (Asset List)

Menu: **Plant**  
Component: `AssetList`

Purpose:
- Manage and browse the list of plant/asset items in the system.

Typical functions:
- Search or scroll the list of assets.
- View each asset’s ID, name and status.
- Open an asset to see its inspection timeline (where supported).

`Screenshot: Asset list with sample plant items`

---

## 6. Inspections

Menu: **Inspections**  
Component: `InspectionsList`

Purpose:
- Schedule, view and complete inspections for assets.

### 6.1 Inspections screen layout

Main areas:
- **Schedule Inspection** button at the top.
- **Schedule New Inspection** form (when expanded).
- **All Inspections** table.

`Screenshot: Inspections screen with table and Schedule button`

### 6.2 Scheduling a new inspection

1. Click **Schedule Inspection**.
2. In the form:
   - **Asset**: choose the asset to be inspected.
   - **Inspection Type**: pick an existing type or choose **Other** to create a new one.
   - **Company / Person Assigned To**: who will perform the inspection.
   - **Due Date**: required inspection due date.
   - **Notes**: any free-text comments.
3. Click **Schedule Inspection** to save.
4. The new inspection appears in the **All Inspections** table and a log entry is created.

`Screenshot: New inspection form`

### 6.3 Reading the inspections table

Columns:
- **Asset ID / Asset Name**: which plant item the inspection belongs to.
- **Inspection Type**: e.g. MOT, Fire Extinguishers.
- **Due Date**: planned inspection due date.
- **Status**:
  - **PENDING** – inspection still to be completed.
  - **COMPLETED** – inspection has been fully completed and locked.
  - Badge colour and small text underneath indicate due/overdue days.
- **Actions**:
  - For PENDING inspections: **Mark Complete** button.
  - For COMPLETED inspections: gold **Locked** indicator.

Behaviour:
- Clicking anywhere on a row opens the **Inspection Details** modal.
- Clicking **Mark Complete** on a pending row also opens the modal ready for completion.

`Screenshot: All Inspections table with pending and completed rows`

### 6.4 Inspection Details modal

Component: `InspectionModal`

Open by:
- Clicking any inspection row, or
- Clicking **Mark Complete** on a pending inspection.

Fields and controls:
- **Inspection Type** (read-only).
- **Company / Person Assigned To**.
- **Due Date**.
- **Date Completed** (required to mark as complete).
- **Date Next Inspection Required** with **N/A** checkbox.
- **Certs Received** checkbox and **Google Drive Link for Certs** (required if Certs Received is ticked).
- **Defect Portal** section:
  - **Actions created in Defect Portal** (checkbox).
  - **Defect Portal N/A** (checkbox).
- **Notes** free text area.
- **Current Status** badge and related checklist shortcuts.
- Bottom actions:
  - **Save Changes** – saves any edits but keeps status as-is.
  - **Mark as Complete** – runs additional checks and completes the inspection.
  - **Cancel** – close without saving.

Required to mark as complete:
- **Date Completed** is filled in.
- Either **Date Next Inspection** is set or **N/A** is ticked.
- **Certs Received** is ticked and a valid **Google Drive Link** is provided.
- Either **Actions created in Defect Portal** or **Defect Portal N/A** is ticked.

If any requirement is missing, a message lists what still needs completing.

Locking behaviour:
- Once an inspection is completed:
  - All fields become read-only.
  - **Save Changes** and **Mark as Complete** are hidden.
  - A gold **🔒 Inspection locked (completed)** indicator is shown instead.

`Screenshot: Inspection modal before completion`
`Screenshot: Inspection modal locked after completion`

### 6.5 Inspection logs (audit trail)

At the bottom of the modal is an **Inspection Logs** section.

Shows one line per logged event, for example:
- Scheduling an inspection.
- Editing details in the modal.
- Creating a checklist.
- Marking an inspection as complete.

Each entry includes:
- Date and time of the action.
- The user’s email address (who performed the action).
- A description, including:
  - What operation occurred.
  - For edits, which fields changed and their before/after values where available.

This provides a full history of how each inspection has been managed.

`Screenshot: Inspection modal logs section`

---

## 7. My Checklists

Menu: **My Checklists**  
Components: `MyChecklists`, `MyChecklistDetailModal`

Purpose:
- Show the logged-in user the inspection checklists assigned to them.

Typical functions:
- View a list of your open/completed checklists.
- Open a checklist to tick off items and add comments.
- See status (e.g. in progress, completed).

`Screenshot: My Checklists list`
`Screenshot: A single checklist detail modal`

---

## 8. Events

Menu: **Events**  
Component: `Events`

Purpose:
- View or manage events associated with assets or inspections (exact behaviour depends on your configuration).

`Screenshot: Events page`

---

## 9. User Management

Menu: **Users**  
Component: `UserManagement`

Purpose:
- Administer user accounts for the portal.

Typical functions:
- View existing users.
- Create or deactivate users.
- Set roles or permissions (where implemented).

`Screenshot: User management screen`

---

## 10. Inspection Folders (Drive Links)

Menu: **Inspection Folders**  
Component: `InspectionTypeDriveLinks`

Purpose:
- Manage default Google Drive folders/links associated with inspection types.

Typical functions:
- For each inspection type, configure the folder where certificates or reports are stored.
- These links are used by the inspection modal’s **Open Folder** button.

`Screenshot: Inspection type drive links admin`

---

## 11. Admin Tools

Menu: **Admin Tools**  
Component: `AdminTools`

Purpose:
- Provide advanced/admin-only operations (data maintenance, bulk operations, utilities). Exact contents may evolve over time.

`Screenshot: Admin tools screen`

---

## 12. Inspection Items Admin

Menu: **Inspection Items**  
Component: `InspectionItemsAdmin`

Purpose:
- Manage the master list of inspection items / templates used in checklists.

Typical functions:
- Add or update inspection items.
- Organise items by type or asset category.

`Screenshot: Inspection items admin`

---

## 13. Asset Timelines (if visible)

Components: `AssetInspectionTimeline`, `AssetTimeline`

Purpose:
- Visualise inspection and event history over time for a single asset.

Typical functions:
- See when inspections were carried out.
- Spot gaps or clusters in activity.

`Screenshot: Example asset inspection timeline`

---

## 14. Notifications and Reminders (conceptual)

Behind the scenes, Supabase edge functions can send reminder emails for upcoming inspections based on due dates. The key points for operators:

- Keeping **Due Date** accurate is important so reminders are correct.
- Updating **Date Next Inspection** after completion ensures the next cycle is scheduled.

(Technical setup of the reminder functions is handled by developers/administrators.)

---

## 15. Logging and Audit Summary

Across the portal, key actions are written to Supabase tables such as `inspection_logs`. For end users this means:

- Important changes and completions are recorded with who did them and when.
- The **Inspection Logs** section in the modal lets you review this history without needing database access.

---

## 16. Glossary

- **Asset / Plant item** – a physical piece of equipment being inspected.
- **Inspection** – a scheduled check or statutory test for an asset.
- **Checklist** – a list of items/tasks to perform for an inspection.
- **Certificate (Certs)** – supporting documentation uploaded to Google Drive.
- **Defect Portal** – external system where defects and corrective actions are logged.

---

## 17. Future additions

This manual is a starting point. As the portal evolves you can extend it by:

- Adding screenshots under the existing `Screenshot:` captions.
- Expanding sections for new pages or features.
- Adding role-based guidance (e.g. Inspector vs. Admin responsibilities).
