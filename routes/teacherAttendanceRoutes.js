const express = require("express");
const { ObjectId } = require("mongodb");
const {
  isWithinMadrasaGeofence,
  getDhakaTime,
  evaluateCheckInStatus,
  evaluateCheckOutStatus,
  MADRASA_LOCATION,
  ATTENDANCE_RULES,
} = require("../utils/attendanceConfig");

function teacherAttendanceRoutes(collections, authHelpers) {
  const router = express.Router();
  const { teachersAttendanceCollection, usersCollection, teachersCollection } =
    collections;

  /**
   * Helper to resolve teacher info from req
   */
  async function resolveTeacher(req) {
    const email =
      req.headers["x-user-email"] ||
      req.body?.teacherEmail ||
      req.body?.email ||
      req.query?.teacherEmail ||
      req.query?.email;

    if (!email) return null;

    const cleanEmail = String(email).trim().toLowerCase();

    let userDoc = null;
    if (usersCollection) {
      userDoc = await usersCollection.findOne({
        email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      });
    }

    let profileDoc = null;
    if (teachersCollection) {
      profileDoc = await teachersCollection.findOne({
        email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      });
    }

    return {
      id: userDoc?._id?.toString() || profileDoc?._id?.toString() || req.body?.teacherId || "teacher-id",
      name: profileDoc?.fullName || profileDoc?.name || userDoc?.name || cleanEmail.split("@")[0],
      email: cleanEmail,
      role: (userDoc?.role || "teacher").toLowerCase(),
      designation: profileDoc?.designation || userDoc?.designation || "শিক্ষক",
      profileImage: profileDoc?.profileImage || profileDoc?.image || userDoc?.image || "",
    };
  }

  /**
   * POST /api/attendance/check-in
   */
  router.post("/api/attendance/check-in", async (req, res) => {
    try {
      const body = req.body || {};
      const { lat, lng } = body;

      const teacher = await resolveTeacher(req);
      if (!teacher) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      if (lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          message: "ডিভাইসের অবস্থান (Latitude ও Longitude) প্রয়োজন।",
        });
      }

      const effectiveLat = Number(lat);
      const effectiveLng = Number(lng);

      const geofenceResult = isWithinMadrasaGeofence(effectiveLat, effectiveLng);
      if (!geofenceResult.isInside) {
        return res.status(403).json({
          success: false,
          message: "You must be inside the madrasa premises to submit attendance.",
          distance: geofenceResult.distance,
          threshold: geofenceResult.threshold,
        });
      }

      const { dateStr } = getDhakaTime();
      const now = new Date();
      const checkInStatus = evaluateCheckInStatus(now);

      const existing = await teachersAttendanceCollection.findOne({
        teacherEmail: teacher.email,
        date: dateStr,
      });

      if (existing && existing.checkInTime) {
        return res.status(400).json({
          success: false,
          message: "আপনি আজকের হাজিরা (Check-In) ইতিমধ্যে সম্পন্ন করেছেন।",
          attendance: existing,
        });
      }

      const checkInComment = (body.checkInComment || body.comment || "").trim();

      const attendanceDoc = {
        teacherEmail: teacher.email,
        teacherName: teacher.name,
        teacherId: teacher.id,
        date: dateStr,
        checkInTime: now.toISOString(),
        checkInStatus: checkInStatus, // 'On Time' | 'Late'
        checkInComment: checkInComment || null,
        checkInLocation: {
          lat: effectiveLat,
          lng: effectiveLng,
        },
        checkOutTime: null,
        checkOutStatus: null,
        checkOutLocation: null,
        createdAt: now,
        updatedAt: now,
      };

      if (existing) {
        await teachersAttendanceCollection.updateOne(
          { _id: existing._id },
          {
            $set: {
              checkInTime: attendanceDoc.checkInTime,
              checkInStatus: attendanceDoc.checkInStatus,
              checkInComment: attendanceDoc.checkInComment,
              checkInLocation: attendanceDoc.checkInLocation,
              updatedAt: now,
            },
          }
        );
        attendanceDoc._id = existing._id;
      } else {
        const result = await teachersAttendanceCollection.insertOne(attendanceDoc);
        attendanceDoc._id = result.insertedId;
      }

      res.status(200).json({
        success: true,
        message:
          checkInStatus === "On Time"
            ? "সফলভাবে সময়মতো প্রবেশ হাজিরা নিশ্চিত হয়েছে! (On Time)"
            : "দেরিতে প্রবেশ হাজিরা নিশ্চিত হয়েছে! (Late)",
        checkInStatus,
        attendance: attendanceDoc,
      });
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({
        success: false,
        message: "হাজিরা সাবমিট করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/attendance/check-out
   */
  router.post("/api/attendance/check-out", async (req, res) => {
    try {
      const body = req.body || {};
      const { lat, lng } = body;

      const teacher = await resolveTeacher(req);
      if (!teacher) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      if (lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          message: "ডিভাইসের অবস্থান (Latitude ও Longitude) প্রয়োজন।",
        });
      }

      const effectiveLat = Number(lat);
      const effectiveLng = Number(lng);

      const geofenceResult = isWithinMadrasaGeofence(effectiveLat, effectiveLng);
      if (!geofenceResult.isInside) {
        return res.status(403).json({
          success: false,
          message: "You must be inside the madrasa premises to submit attendance.",
          distance: geofenceResult.distance,
          threshold: geofenceResult.threshold,
        });
      }

      const { dateStr } = getDhakaTime();
      const now = new Date();
      const checkOutStatus = evaluateCheckOutStatus(now);

      const existing = await teachersAttendanceCollection.findOne({
        teacherEmail: teacher.email,
        date: dateStr,
      });

      if (!existing || !existing.checkInTime) {
        return res.status(400).json({
          success: false,
          message: "আজকের কোনো প্রবেশ হাজিরা (Check-In) পাওয়া যায়নি। আগে Check-In সম্পন্ন করুন।",
        });
      }

      if (existing.checkOutTime) {
        return res.status(400).json({
          success: false,
          message: "আপনি আজকের প্রস্থান হাজিরা (Check-Out) ইতিমধ্যে সম্পন্ন করেছেন।",
          attendance: existing,
        });
      }

      const checkOutComment = (body.checkOutComment || body.comment || "").trim();
      const checkOutLocation = {
        lat: effectiveLat,
        lng: effectiveLng,
      };

      await teachersAttendanceCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            checkOutTime: now.toISOString(),
            checkOutStatus: checkOutStatus, // 'On Time' | 'Early'
            checkOutComment: checkOutComment || null,
            checkOutLocation: checkOutLocation,
            updatedAt: now,
          },
        }
      );

      const updatedDoc = {
        ...existing,
        checkOutTime: now.toISOString(),
        checkOutStatus,
        checkOutComment: checkOutComment || null,
        checkOutLocation,
        updatedAt: now,
      };

      res.status(200).json({
        success: true,
        message:
          checkOutStatus === "On Time"
            ? "সফলভাবে প্রস্থান হাজিরা নিশ্চিত হয়েছে! (Completed / On Time Departure)"
            : "সময় শেষ হওয়ার পূর্বে প্রস্থান সম্পন্ন হয়েছে! (Early Departure)",
        checkOutStatus,
        attendance: updatedDoc,
      });
    } catch (error) {
      console.error("Check-out error:", error);
      res.status(500).json({
        success: false,
        message: "প্রস্থান হাজিরা সাবমিট করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/attendance/today
   */
  router.get("/api/attendance/today", async (req, res) => {
    try {
      const teacher = await resolveTeacher(req);
      if (!teacher) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      const { dateStr } = getDhakaTime();

      const attendanceRecord = await teachersAttendanceCollection.findOne({
        teacherEmail: teacher.email,
        date: dateStr,
      });

      res.status(200).json({
        success: true,
        today: dateStr,
        user: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          role: teacher.role,
          designation: teacher.designation || "শিক্ষক",
          profileImage: teacher.profileImage || "",
        },
        attendance: attendanceRecord || null,
        madrasaLocation: MADRASA_LOCATION,
        rules: ATTENDANCE_RULES,
      });
    } catch (error) {
      console.error("Error fetching today attendance:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/attendance/history
   */
  router.get("/api/attendance/history", async (req, res) => {
    try {
      const teacher = await resolveTeacher(req);
      if (!teacher) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই।",
        });
      }

      const limit = parseInt(req.query.limit || "30", 10);

      const history = await teachersAttendanceCollection
        .find({ teacherEmail: teacher.email })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .toArray();

      res.status(200).json({
        success: true,
        history,
      });
    } catch (error) {
      console.error("History fetch error:", error);
      res.status(500).json({
        success: false,
        message: "হিস্ট্রি লোড করতে ব্যর্থ হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/admin/teachers-attendance
   */
  router.get("/api/admin/teachers-attendance", async (req, res) => {
    try {
      const dateParam = req.query.date;
      const search = (req.query.search || "").trim().toLowerCase();
      const statusFilter = req.query.status || "all";

      const { dateStr: todayStr } = getDhakaTime();
      const targetDate = dateParam || todayStr;

      let teacherUsers = [];
      if (usersCollection) {
        teacherUsers = await usersCollection
          .find({ role: { $regex: /^teacher$/i } })
          .toArray()
          .catch(() => []);
      }

      let teachersProfileList = [];
      if (teachersCollection) {
        teachersProfileList = await teachersCollection
          .find({})
          .toArray()
          .catch(() => []);
      }

      const teacherProfileByEmail = new Map();
      teachersProfileList.forEach((t) => {
        if (t.email) {
          teacherProfileByEmail.set(t.email.toLowerCase(), t);
        }
      });

      const totalTeachersCount = teacherUsers.length;

      const attendanceLogs = await teachersAttendanceCollection
        .find({ date: targetDate })
        .toArray();

      const presentTeachers = attendanceLogs.filter((log) => !!log.checkInTime);
      const presentCount = presentTeachers.length;
      const absentCount = Math.max(0, totalTeachersCount - presentCount);

      const onTimeCount = attendanceLogs.filter(
        (log) => log.checkInStatus === "On Time"
      ).length;

      const lateCount = attendanceLogs.filter(
        (log) => log.checkInStatus === "Late"
      ).length;

      const attendanceByEmail = new Map();
      attendanceLogs.forEach((log) => {
        if (log.teacherEmail) {
          attendanceByEmail.set(log.teacherEmail.toLowerCase(), log);
        }
      });

      const unifiedList = [];
      const processedEmails = new Set();

      for (const teacher of teacherUsers) {
        const emailLower = (teacher.email || "").toLowerCase();
        processedEmails.add(emailLower);

        const profile = teacherProfileByEmail.get(emailLower);
        const attendance = attendanceByEmail.get(emailLower);

        unifiedList.push({
          teacherId: teacher._id.toString(),
          teacherName: teacher.name || profile?.fullName || profile?.name || "নাম পাওয়া যায়নি",
          teacherEmail: teacher.email || "",
          designation: profile?.designation || teacher.designation || "শিক্ষক",
          phone: profile?.phone || teacher.phone || "",
          profileImage: teacher.image || profile?.profileImage || "",
          date: targetDate,
          hasCheckedIn: !!attendance?.checkInTime,
          checkInTime: attendance?.checkInTime || null,
          checkInStatus: attendance?.checkInStatus || "Absent",
          checkInLocation: attendance?.checkInLocation || null,
          checkInComment: attendance?.checkInComment || null,
          hasCheckedOut: !!attendance?.checkOutTime,
          checkOutTime: attendance?.checkOutTime || null,
          checkOutStatus: attendance?.checkOutStatus || null,
          checkOutLocation: attendance?.checkOutLocation || null,
          checkOutComment: attendance?.checkOutComment || null,
          attendanceId: attendance?._id?.toString() || null,
        });
      }

      for (const attendance of attendanceLogs) {
        const emailLower = (attendance.teacherEmail || "").toLowerCase();
        if (!processedEmails.has(emailLower)) {
          unifiedList.push({
            teacherId: attendance.teacherId || attendance._id.toString(),
            teacherName: attendance.teacherName || attendance.teacherEmail,
            teacherEmail: attendance.teacherEmail,
            designation: "শিক্ষক",
            phone: "",
            profileImage: "",
            date: targetDate,
            hasCheckedIn: !!attendance.checkInTime,
            checkInTime: attendance.checkInTime || null,
            checkInStatus: attendance.checkInStatus || "On Time",
            checkInLocation: attendance.checkInLocation || null,
            checkInComment: attendance.checkInComment || null,
            hasCheckedOut: !!attendance.checkOutTime,
            checkOutTime: attendance.checkOutTime || null,
            checkOutStatus: attendance.checkOutStatus || null,
            checkOutLocation: attendance.checkOutLocation || null,
            checkOutComment: attendance.checkOutComment || null,
            attendanceId: attendance._id.toString(),
          });
        }
      }

      let filteredList = unifiedList;

      if (search) {
        filteredList = filteredList.filter(
          (item) =>
            item.teacherName.toLowerCase().includes(search) ||
            item.teacherEmail.toLowerCase().includes(search) ||
            item.designation.toLowerCase().includes(search)
        );
      }

      if (statusFilter === "present") {
        filteredList = filteredList.filter((item) => item.hasCheckedIn);
      } else if (statusFilter === "absent") {
        filteredList = filteredList.filter((item) => !item.hasCheckedIn);
      } else if (statusFilter === "onTime") {
        filteredList = filteredList.filter(
          (item) => item.checkInStatus === "On Time"
        );
      } else if (statusFilter === "late") {
        filteredList = filteredList.filter(
          (item) => item.checkInStatus === "Late"
        );
      }

      res.status(200).json({
        success: true,
        date: targetDate,
        isToday: targetDate === todayStr,
        metrics: {
          totalTeachers: totalTeachersCount,
          presentToday: presentCount,
          absentToday: absentCount,
          onTimeToday: onTimeCount,
          lateToday: lateCount,
        },
        attendanceList: filteredList,
      });
    } catch (error) {
      console.error("Admin teachers attendance error:", error);
      res.status(500).json({
        success: false,
        message: "শিক্ষক হাজিরা তথ্য লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/admin/teachers-attendance/monthly
   */
  router.get("/api/admin/teachers-attendance/monthly", async (req, res) => {
    try {
      const { dateStr } = getDhakaTime();
      const currentMonth = dateStr.slice(0, 7); // "YYYY-MM"
      const month = req.query.month || currentMonth;

      let teacherUsers = [];
      if (usersCollection) {
        teacherUsers = await usersCollection
          .find({ role: { $regex: /^teacher$/i } })
          .toArray()
          .catch(() => []);
      }

      let teachersProfileList = [];
      if (teachersCollection) {
        teachersProfileList = await teachersCollection
          .find({})
          .toArray()
          .catch(() => []);
      }

      const teacherProfileByEmail = new Map();
      teachersProfileList.forEach((t) => {
        if (t.email) {
          teacherProfileByEmail.set(t.email.toLowerCase(), t);
        }
      });

      const attendanceLogs = await teachersAttendanceCollection
        .find({ date: { $regex: `^${month}` } })
        .sort({ date: 1 })
        .toArray();

      const distinctDates = Array.from(new Set(attendanceLogs.map((l) => l.date))).sort();
      const totalWorkingDays = distinctDates.length > 0 ? distinctDates.length : 1;

      const logsByEmail = new Map();
      attendanceLogs.forEach((log) => {
        if (!log.teacherEmail) return;
        const emailLower = log.teacherEmail.toLowerCase();
        if (!logsByEmail.has(emailLower)) {
          logsByEmail.set(emailLower, []);
        }
        logsByEmail.get(emailLower).push(log);
      });

      const teacherSummaries = [];
      const processedEmails = new Set();

      for (const teacher of teacherUsers) {
        const emailLower = (teacher.email || "").toLowerCase();
        processedEmails.add(emailLower);

        const profile = teacherProfileByEmail.get(emailLower);
        const logs = logsByEmail.get(emailLower) || [];

        const presentLogs = logs.filter((l) => !!l.checkInTime);
        const presentDays = presentLogs.length;
        const onTimeDays = logs.filter((l) => l.checkInStatus === "On Time").length;
        const lateDays = logs.filter((l) => l.checkInStatus === "Late").length;
        const earlyExitDays = logs.filter((l) => l.checkOutStatus === "Early").length;
        const absentDays = Math.max(0, totalWorkingDays - presentDays);
        const attendanceRate = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;

        const lateComments = logs
          .filter((l) => l.checkInComment)
          .map((l) => ({ date: l.date, comment: l.checkInComment }));
        const earlyComments = logs
          .filter((l) => l.checkOutComment)
          .map((l) => ({ date: l.date, comment: l.checkOutComment }));

        teacherSummaries.push({
          teacherId: teacher._id.toString(),
          teacherName: teacher.name || profile?.fullName || profile?.name || "নাম পাওয়া যায়নি",
          teacherEmail: teacher.email || "",
          designation: profile?.designation || teacher.designation || "শিক্ষক",
          phone: profile?.phone || teacher.phone || "",
          presentDays,
          onTimeDays,
          lateDays,
          earlyExitDays,
          absentDays,
          attendanceRate,
          lateComments,
          earlyComments,
        });
      }

      for (const [emailLower, logs] of logsByEmail.entries()) {
        if (!processedEmails.has(emailLower)) {
          const firstLog = logs[0];
          const presentLogs = logs.filter((l) => !!l.checkInTime);
          const presentDays = presentLogs.length;
          const onTimeDays = logs.filter((l) => l.checkInStatus === "On Time").length;
          const lateDays = logs.filter((l) => l.checkInStatus === "Late").length;
          const earlyExitDays = logs.filter((l) => l.checkOutStatus === "Early").length;
          const absentDays = Math.max(0, totalWorkingDays - presentDays);
          const attendanceRate = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;

          teacherSummaries.push({
            teacherId: firstLog.teacherId || emailLower,
            teacherName: firstLog.teacherName || emailLower,
            teacherEmail: firstLog.teacherEmail,
            designation: "শিক্ষক",
            phone: "",
            presentDays,
            onTimeDays,
            lateDays,
            earlyExitDays,
            absentDays,
            attendanceRate,
            lateComments: logs.filter((l) => l.checkInComment).map((l) => ({ date: l.date, comment: l.checkInComment })),
            earlyComments: logs.filter((l) => l.checkOutComment).map((l) => ({ date: l.date, comment: l.checkOutComment })),
          });
        }
      }

      res.status(200).json({
        success: true,
        month,
        totalTeachers: teacherSummaries.length,
        totalWorkingDays,
        distinctDates,
        teachersSummary: teacherSummaries,
      });
    } catch (error) {
      console.error("Monthly teachers attendance error:", error);
      res.status(500).json({
        success: false,
        message: "মাসিক শিক্ষক হাজিরা লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = teacherAttendanceRoutes;
