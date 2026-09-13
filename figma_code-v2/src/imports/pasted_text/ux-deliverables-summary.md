Deliverables I'll Create
1. Complete UX Flow
Login
    │
Dashboard
    │
 ┌───────────────┬────────────────┐
 │               │                │
Add Company   Existing Company   Dashboard Tools
 │               │                │
Wizard          View Flow         Search
 │               │                Alerts
 │               │                History
 │               │                Export
 │               │                Upload PDF
 │
Success
2. Information Architecture
Dashboard

├── Add New Company
│      ├── Company Details
│      ├── Commercial Details
│      ├── Payroll Details
│      └── Review & Save
│
├── Existing Company
│      ├── Overview
│      ├── Commercial
│      ├── Payroll
│      └── Print
│
├── Search

├── MOU Expiry

├── Upload PDF

├── Agreement History

├── Zone Dashboard

├── Export
3. High-Fidelity Wireframe Structure
Login
+----------------------------------+

LOGO

Company MOU Management

Username

Password

Remember Me

Forgot Password

Login Button

Dashboard

Instead of two large buttons only, use dashboard cards.

-------------------------------------------------

Good Morning Rajendra

Search Company __________

-------------------------------------------------

+ Add New Company

+ Existing Company

+ Upload MOU

+ Expiry Alert

+ Agreement History

+ Export

-------------------------------------------------

Quick Statistics

Total Companies

Active MOU

Expiring Soon

Expired

Pending Review

-------------------------------------------------

Recent Activity


This reduces navigation significantly.

4. Add Company Wizard

Instead of three disconnected pages, use a Stepper.

Company Details
Commercial Details
Payroll
Review


Progress always visible.

①────②────③────④
Company Details

Instead of a long form, divide into cards.

Basic Information

Company Name

Company Type

Registration Type

GST

TAN

Zone

Plant

---------------------------

Address

Address Line 1

Address Line 2

City

District

State

PIN

---------------------------

HR Contact

Finance Contact

---------------------------

Official Email

Confirm Email


Auto validation.

Auto GST validation.

PIN auto fills State.

Email confirmation check.

Commercial Page

Group into sections.

Agreement

Start Date

Tenure

Upload MOU

--------------------

Payment

Attendance Cycle

Stipend Date

--------------------

Charges

Admin

Insurance

Uniform

Training

Assessment

Transportation

...


Instead of showing 15 textboxes immediately

Use

+ Add Charge

or expandable categories.

Payroll Page

Current flow has 21 Yes/No questions.

This is not user friendly.

Instead use

Allowance List

☐ Attendance Bonus

☐ Accommodation

☐ Conveyance

☐ Bonus

☐ Night Shift

☐ Education

☐ Other


When checked

Attendance Bonus

Amount


appears instantly.

No unnecessary Yes/No clicks.

This reduces around 40–50 user interactions while preserving the underlying business rules. The documentation currently describes a Yes/No decision for each payroll item before entering an amount.

Review Screen

Instead of immediately saving

Review

Company

Commercial

Payroll

Generate Code

Save

Back


User can verify everything.

Existing Company

Rather than

Zone

↓

Company

↓

Next

↓

Next

Make it

Search Company

or

Select Zone

↓

Table

Company

Plant

Scheme

Status

View


One click.

Company Profile

Tabs

Overview

Commercial

Payroll

History

Documents


No multiple Next buttons.

The source describes the Existing Company flow as read-only across three stages (Overview, Commercial, Payroll) with Print support. Tabs preserve that structure while making navigation faster.

Dashboard Alerts

Cards

28 MOU Expiring

View

12 Need Renewal

Upload Pending

Search

Instead of

Search by Company

Plant

Scheme

Use global search.

🔍 Search


Searches

Company

GST

Zone

Plant

HR

Scheme

Code

Mobile Responsive

Desktop

Sidebar

Tablet

Collapsible Sidebar

Mobile

Bottom Navigation

Design System

Typography

Inter
IBM Plex Sans

Colors

Primary

Blue

Success

Green

Warning

Orange

Danger

Red

Spacing

8pt Grid

Buttons

48px

Inputs

48px

Cards

16px Radius

Shadow

Level 1

UX Improvements Over the Current Flow
Current	Proposed UX
Long forms	Grouped cards and sections
21 Yes/No questions	Checkbox-driven dynamic fields
Multiple Next pages	Progress stepper with review
Separate search	Global smart search
Multiple dropdowns	Searchable dropdowns
No summary	Dashboard KPIs
Hidden validation	Real-time validation
Manual review	Review & confirmation screen
Static tables	Sortable, filterable data grid
Multiple clicks	Fewer clicks with progressive disclosure
Complete Figma Deliverables

For this module, I would create a complete UX package including:

User Flow Diagram
Information Architecture
Task Flow
Low-Fidelity Wireframes
Mid-Fidelity Wireframes
High-Fidelity UI Design
Interactive Figma Prototype
Design System (Components, Variables, Auto Layout)
Responsive Desktop Layout
Tablet & Mobile Adaptations
Developer Handoff Specifications
UI Style Guide
Micro-interactions and Form Validation States
Empty, Loading, Success, and Error States
Clickable Prototype covering the complete end-to-end workflow