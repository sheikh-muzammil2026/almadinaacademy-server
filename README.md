# 🕌 Al-Madina Islamic Academy - Server API

Backend RESTful API service for **Al-Madina Islamic Academy** (আল-মদিনা ইসলামিক একাডেমি | أكاديمية المدينة الإسلامية), Brahmanbaria.

Built with **Node.js**, **Express 5**, and **MongoDB Native Driver**.

---

## 📋 Features

- **Admit Card & Exam Management**: Dynamic seat plans, hall setups, exam routines, and admit card generation.
- **Parent Portal**: Attendance tracking, student profiles, result publishing, and notice distribution.
- **Administration & Roles**: Staff and teacher management with multi-tier access control.
- **Mailing Service**: Automated transactional emails powered by Nodemailer.
- **Smart Classroom**: Interactive classroom session coordination and real-time passcodes.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: MongoDB (Native Driver v7.x)
- **Email Service**: Nodemailer
- **Environment**: Dotenv

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB connection URI

### 2. Installation
```bash
cd al-madina-server
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
DB_NAME=aimhabiganj # or your custom database name
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="AL-MADINA ISLAMIC ACADEMY" <your_email@gmail.com>
```

### 4. Running the Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```
