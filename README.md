# 🏠 MessPilot — Smart Mess Management System

MessPilot is a **mobile-first web application** built to simplify mess (shared housing) management.

It replaces manual spreadsheets and WhatsApp-based calculations with a **clear, automated system** for tracking meals, deposits, expenses, and monthly balances.

---

## 🚀 Problem It Solves

Managing a bachelor mess usually leads to:

* ❌ Manual meal counting errors
* ❌ Confusing expense tracking
* ❌ End-of-month calculation stress
* ❌ Lack of transparency

### ✅ MessPilot fixes this by:

* Automating meal rate calculation
* Tracking all financial activity in one place
* Showing real-time member balances
* Generating clean monthly reports

---

## 🎯 Core Features

### 👥 Member Management

* Add, edit, and manage members
* Active / inactive control
* Role-based system (Super Admin / Admin / Bazar Contributor / Member)

---

### 🍽️ Meal Tracking

* Daily meal entry per member
* Fast and simple input system
* Monthly aggregation

---

### 💰 Deposit Tracking

* Record deposits per member
* Submit-and-approve workflow for member-submitted deposits
* Real-time financial visibility

---

### 🛒 Bazar Expense Management

* Track shared expenses
* Categorize spending
* Submit-and-approve workflow before spend counts toward the meal rate

---

### 🧾 Rent & Utility Bills

* Per-member rent bills
* Utility bills auto-split equally across active members
* Member "mark as paid" → admin review queue

---

### ⚡ Live Meal Rate Calculation

```math
Meal\ Rate = \frac{Total\ Approved\ Expense}{Total\ Meals}
```

Updates instantly when:

* meals change
* approved expenses change

---

### 📊 Member Balance System

```math
Balance = Deposits - (Meals \times Meal\ Rate)
```

* 🔴 Negative → Due
* 🟢 Positive → Advance

---

### 📝 Correction Requests

* Members can request a meal-count fix or an away/back status change
* Admin can auto-apply, approve manually, or reject — every outcome logged

---

### 🔍 Transparency Log

* Append-only audit trail of every change
* Filterable by entity, action, and free-text search

---

### 📅 Monthly Report

* Total meals, expenses, deposits
* Final meal rate
* Member-wise breakdown:

  * meals
  * cost
  * deposits
  * balance

---

### 🔒 Month Closing System

* Admin can finalize a month
* Locks all data after closing
* Stores final values
* Prevents accidental edits

---

## 🧱 Tech Stack

### Frontend

* Vite
* React 18 + TypeScript
* Tailwind CSS + shadcn/ui (Radix primitives)
* TanStack Query, React Router, React Hook Form + Zod

### Backend

* Supabase (Postgres + Auth + Edge Functions)

### Deployment

* Vercel

---

## 🧠 System Philosophy

MessPilot is built with:

* **Simplicity over complexity**
* **Speed over feature overload**
* **Mobile-first usability**
* **Financial transparency**
* **Low daily effort usage**

---

## 📱 UX Principles

* Fast input (1–2 taps)
* Large touch-friendly UI
* Clean dashboard
* Low cognitive load
* Designed for non-technical users

---

## 🗂️ Project Structure (Conceptual)

```
/src
  /pages
    Dashboard, Members, Meals, Deposits, Bazar,
    Bills, Report, Transparency, Corrections, Settings, Auth
  /components
  /hooks
  /integrations/supabase
  /lib

/supabase
  /migrations
  /functions
```

---

## 🔑 Core Business Logic

### Meal Rate

```math
mealRate = \frac{totalApprovedExpense}{totalMeals}
```

### Member Balance

```math
balance = deposits - (mealCount \times mealRate)
```

See `docs/MessPilot PRD.md` for the full product requirements, data model, and workflow specs.

---

## ⚙️ Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/AlveeUX/iMess-v1.0.0.git
cd iMess-v1.0.0
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Setup Environment Variables

Create `.env`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

---

### 4. Run Development Server

```bash
npm run dev
```

---

### 5. Deploy

Deploy easily with:

* Vercel (recommended)

---

## 🚧 Roadmap

### Near-term

* Wire dashboard placeholder tiles to real Bills data
* Retire/merge the legacy `/expenses` route into `/bazar`

### V1

* Notifications
* Improved reports

### V2

* WhatsApp/SMS alerts
* PDF export
* Multi-mess support
* Advanced analytics

---

## ⚠️ Important Notes

* This is an MVP for real-world use
* Financial calculations should be verified before heavy usage
* Month closing ensures data integrity

---

## 🤝 Contribution

Feel free to:

* Fork the repo
* Suggest improvements
* Submit pull requests

---

## 📄 License

MIT License

---

## 👨‍💻 Author

TreeTech Studios

---

## ⭐ Final Thought

> If daily usage is easy → people will use it
> If people use it → the system becomes valuable

MessPilot is designed to make **daily usage effortless**.

© 2026 TreeTech Studios. All rights reserved.
