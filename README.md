# 🏠 iMess — Smart Mess Management System

iMess is a **mobile-first web application** built to simplify mess (shared housing) management.

It replaces manual spreadsheets and WhatsApp-based calculations with a **clear, automated system** for tracking meals, deposits, expenses, and monthly balances.

---

## 🚀 Problem It Solves

Managing a bachelor mess usually leads to:

* ❌ Manual meal counting errors
* ❌ Confusing expense tracking
* ❌ End-of-month calculation stress
* ❌ Lack of transparency

### ✅ iMess fixes this by:

* Automating meal rate calculation
* Tracking all financial activity in one place
* Showing real-time member balances
* Generating clean monthly reports

---

## 🎯 Core Features

### 👥 Member Management

* Add, edit, and manage members
* Active / inactive control
* Role-based system (Admin / Member)

---

### 🍽️ Meal Tracking

* Daily meal entry per member
* Fast and simple input system
* Monthly aggregation

---

### 💰 Deposit Tracking

* Record deposits per member
* Track total contributions
* Real-time financial visibility

---

### 🛒 Bazar Expense Management

* Track shared expenses
* Categorize spending
* Maintain total expense overview

---

### ⚡ Live Meal Rate Calculation

```math
Meal\ Rate = \frac{Total\ Expense}{Total\ Meals}
```

Updates instantly when:

* meals change
* expenses change

---

### 📊 Member Balance System

```math
Balance = Deposits - (Meals \times Meal\ Rate)
```

* 🔴 Negative → Due
* 🟢 Positive → Advance

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

* Next.js
* TypeScript
* Tailwind CSS

### Backend

* Firebase (Auth + Firestore + Functions)
  *(or Supabase depending on configuration)*

### Deployment

* Vercel

---

## 🧠 System Philosophy

iMess is built with:

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
/app
  /dashboard
  /members
  /meals
  /deposits
  /expenses
  /report
  /settings

/components
/lib
/firebase (or supabase)
/functions
```

---

## 🔑 Core Business Logic

### Meal Rate

```math
mealRate = \frac{totalExpense}{totalMeals}
```

### Member Balance

```math
balance = deposits - (mealCount \times mealRate)
```

---

## ⚙️ Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/iMess.git
cd iMess
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Setup Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

*(or Supabase config if used)*

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

## 🧪 Demo Data

Includes:

* Sample members
* Meals
* Deposits
* Expenses

So you can test immediately.

---

## 🚧 Roadmap

### V1

* Notifications
* Improved reports
* UI polish

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

iMess is designed to make **daily usage effortless**.

© 2026 TreeTech Studios. All rights reserved.
