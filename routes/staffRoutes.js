const express = require("express");
const { ObjectId } = require("mongodb");

const INITIAL_STAFF_MEMBERS = [
  {
    fullName: "মুহাম্মদ আব্দুল্লাহ",
    designation: "অফিস সহকারী (Office Assistant)",
    dateOfBirth: "15/05/1992",
    phone: "01712345678",
    email: "abdullah.office@almadina.edu.bd",
    bloodGroup: "A (+)",
    staffId: "ID NO-AMIA ST-001",
    profileImage: "",
    address: "সদর, ব্রাহ্মণবাড়িয়া",
    joiningDate: "01/01/2023",
  },
  {
    fullName: "মোঃ রফিকুল ইসলাম",
    designation: "হিসাব কর্মকর্তা (Accountant)",
    dateOfBirth: "10/08/1990",
    phone: "01812345678",
    email: "rafiq.accounts@almadina.edu.bd",
    bloodGroup: "B (+)",
    staffId: "ID NO-AMIA ST-002",
    profileImage: "",
    address: "সদর, ব্রাহ্মণবাড়িয়া",
    joiningDate: "15/03/2022",
  },
  {
    fullName: "মাওলানা হাবিবুর রহমান",
    designation: "গ্রন্থাগারিক (Librarian)",
    dateOfBirth: "20/11/1988",
    phone: "01912345678",
    email: "habibur.lib@almadina.edu.bd",
    bloodGroup: "O (+)",
    staffId: "ID NO-AMIA ST-003",
    profileImage: "",
    address: "সদর, ব্রাহ্মণবাড়িয়া",
    joiningDate: "01/06/2021",
  },
  {
    fullName: "মোঃ নূরুল আমিন",
    designation: "নিরাপত্তা প্রহরী (Security Guard)",
    dateOfBirth: "05/01/1985",
    phone: "01612345678",
    email: "nurul.security@almadina.edu.bd",
    bloodGroup: "AB (+)",
    staffId: "ID NO-AMIA ST-004",
    profileImage: "",
    address: "সদর, ব্রাহ্মণবাড়িয়া",
    joiningDate: "10/02/2020",
  },
  {
    fullName: "মোঃ শামসুল হক",
    designation: "বাবুর্চি ও ডাইনিং সহকারী (Chef)",
    dateOfBirth: "12/09/1987",
    phone: "01512345678",
    email: "shamsul.chef@almadina.edu.bd",
    bloodGroup: "O (+)",
    staffId: "ID NO-AMIA ST-005",
    profileImage: "",
    address: "সদর, ব্রাহ্মণবাড়িয়া",
    joiningDate: "01/08/2021",
  },
];

function staffRoutes(collections) {
  const router = express.Router();
  const { staffCollection, usersCollection } = collections;

  /**
   * GET /api/staff
   * Public staff directory for About page
   */
  router.get("/api/staff", async (req, res) => {
    try {
      let staffUsers = [];
      if (usersCollection) {
        staffUsers = await usersCollection
          .find({ role: { $regex: /^staff$/i } })
          .toArray()
          .catch(() => []);
      }

      const staffProfiles = await staffCollection
        .find({})
        .toArray()
        .catch(() => []);

      const profileMap = new Map();
      staffProfiles.forEach((s) => {
        if (s.email) {
          profileMap.set(s.email.trim().toLowerCase(), s);
        }
      });

      const staffList = [];
      const addedEmails = new Set();

      staffUsers.forEach((user, index) => {
        const emailKey = (user.email || "").trim().toLowerCase();
        if (emailKey) addedEmails.add(emailKey);

        const profile = emailKey ? profileMap.get(emailKey) : null;

        staffList.push({
          id: user._id?.toString() || profile?._id?.toString() || `staff-${index + 1}`,
          name: profile?.fullName?.trim() || user.name?.trim() || "কর্মকর্তা / কর্মচারী",
          fullName: profile?.fullName?.trim() || user.name?.trim() || "কর্মকর্তা / কর্মচারী",
          role: profile?.designation?.trim() || user.designation?.trim() || "স্টাফ",
          designation: profile?.designation?.trim() || user.designation?.trim() || "স্টাফ",
          department: profile?.department?.trim() || "প্রশাসন ও সেবা",
          phone: profile?.phone || profile?.mobile || user.phone || "",
          contact: profile?.phone || profile?.mobile || user.phone || "",
          email: user.email || profile?.email || "",
          staffId: profile?.staffId || "",
          bloodGroup: profile?.bloodGroup || "",
          joiningDate: profile?.joiningDate || "",
          dateOfBirth: profile?.dateOfBirth || "",
          address: profile?.address || "",
          image: profile?.profileImage || profile?.image || user.image || "",
          profileImage: profile?.profileImage || profile?.image || user.image || "",
          bio: profile?.bio || "",
        });
      });

      staffProfiles.forEach((profile, index) => {
        const emailKey = (profile.email || "").trim().toLowerCase();
        if (!emailKey || !addedEmails.has(emailKey)) {
          if (profile.fullName || profile.name) {
            staffList.push({
              id: profile._id?.toString() || `staff-ext-${index + 1}`,
              name: profile.fullName?.trim() || profile.name?.trim() || "কর্মকর্তা / কর্মচারী",
              fullName: profile.fullName?.trim() || profile.name?.trim() || "কর্মকর্তা / কর্মচারী",
              role: profile.designation?.trim() || "স্টাফ",
              designation: profile.designation?.trim() || "স্টাফ",
              department: profile.department?.trim() || "প্রশাসন ও সেবা",
              phone: profile.phone || profile.mobile || "",
              contact: profile.phone || profile.mobile || "",
              email: profile.email || "",
              staffId: profile.staffId || "",
              bloodGroup: profile.bloodGroup || "",
              joiningDate: profile.joiningDate || "",
              dateOfBirth: profile.dateOfBirth || "",
              address: profile.address || "",
              image: profile.profileImage || profile.image || "",
              profileImage: profile.profileImage || profile.image || "",
              bio: profile.bio || "",
            });
          }
        }
      });

      res.status(200).json({
        success: true,
        count: staffList.length,
        data: staffList,
      });
    } catch (error) {
      console.error("GET /api/staff error:", error);
      res.status(500).json({
        success: false,
        message: "কর্মকর্তা ও কর্মচারীদের তথ্য লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/admin/staff
   * Admin staff list with search filter & auto-seed if collection empty
   */
  router.get("/api/admin/staff", async (req, res) => {
    try {
      const search = (req.query.search || "").trim();

      const totalCount = await staffCollection.countDocuments();
      if (totalCount === 0) {
        const now = new Date();
        const docsToInsert = INITIAL_STAFF_MEMBERS.map((s) => ({
          ...s,
          createdAt: now,
          updatedAt: now,
        }));
        await staffCollection.insertMany(docsToInsert);
      }

      const query = {};
      if (search) {
        const searchRegex = new RegExp(search, "i");
        query.$or = [
          { fullName: searchRegex },
          { name: searchRegex },
          { designation: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { staffId: searchRegex },
        ];
      }

      const rawStaff = await staffCollection
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();

      const staffList = rawStaff.map((s, index) => {
        const idStr = s._id ? s._id.toString() : `staff-${index + 1}`;
        const fallbackStaffId = `ID NO-AIM ST-${String(index + 1).padStart(3, "0")}`;

        return {
          _id: idStr,
          id: idStr,
          fullName: s.fullName || s.name || "নামহীন কর্মচারী",
          designation: s.designation || "স্টাফ",
          dateOfBirth: s.dateOfBirth || s.dob || "",
          phone: s.phone || s.mobile || "",
          bloodGroup: s.bloodGroup || s.blood || "",
          staffId: s.staffId || s.idNo || fallbackStaffId,
          email: s.email || "",
          profileImage: s.profileImage || s.image || "",
          address: s.address || "",
          joiningDate: s.joiningDate || "",
          createdAt: s.createdAt,
        };
      });

      res.status(200).json({
        success: true,
        data: staffList,
        total: staffList.length,
      });
    } catch (error) {
      console.error("GET /api/admin/staff error:", error);
      res.status(500).json({
        success: false,
        message: "স্টাফদের তালিকা লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/admin/staff
   * Add a new staff member
   */
  router.post("/api/admin/staff", async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.fullName || !body.designation) {
        return res.status(400).json({
          success: false,
          message: "স্টাফের পূর্ণ নাম ও পদবি আবশ্যক।",
        });
      }

      const count = await staffCollection.countDocuments();
      const staffId =
        body.staffId || `ID NO-AIM ST-${String(count + 1).padStart(3, "0")}`;

      const newDoc = {
        fullName: body.fullName.trim(),
        designation: body.designation.trim(),
        dateOfBirth: (body.dateOfBirth || "").trim(),
        phone: (body.phone || "").trim(),
        email: (body.email || "").trim(),
        bloodGroup: (body.bloodGroup || "").trim(),
        staffId: staffId.trim(),
        profileImage: (body.profileImage || "").trim(),
        address: (body.address || "").trim(),
        joiningDate: (body.joiningDate || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await staffCollection.insertOne(newDoc);

      res.status(201).json({
        success: true,
        message: "নতুন স্টাফ সফলভাবে যুক্ত হয়েছে!",
        data: {
          _id: result.insertedId.toString(),
          id: result.insertedId.toString(),
          ...newDoc,
        },
      });
    } catch (error) {
      console.error("POST /api/admin/staff error:", error);
      res.status(500).json({
        success: false,
        message: "স্টাফ সংরক্ষণে ব্যর্থ হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * PATCH /api/admin/staff
   * Update an existing staff member
   */
  router.patch("/api/admin/staff", async (req, res) => {
    try {
      const body = req.body || {};
      const { id, _id, ...updateFields } = body;
      const targetId = id || _id;

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: "স্টাফের আইডি দেওয়া হয়নি।",
        });
      }

      let filter = {};
      if (ObjectId.isValid(targetId)) {
        try {
          filter = { $or: [{ _id: new ObjectId(targetId) }, { _id: String(targetId) }] };
        } catch {
          filter = { _id: String(targetId) };
        }
      } else {
        filter = { staffId: targetId };
      }

      updateFields.updatedAt = new Date();

      const updateRes = await staffCollection.updateOne(filter, {
        $set: updateFields,
      });

      if (updateRes.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "স্টাফের রেকর্ড খুঁজে পাওয়া যায়নি।",
        });
      }

      res.status(200).json({
        success: true,
        message: "স্টাফের তথ্য সফলভাবে আপডেট হয়েছে!",
      });
    } catch (error) {
      console.error("PATCH /api/admin/staff error:", error);
      res.status(500).json({
        success: false,
        message: "স্টাফ আপডেট করতে ব্যর্থ হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/admin/staff
   * Remove a staff member
   */
  router.delete("/api/admin/staff", async (req, res) => {
    try {
      const id = req.query.id || req.body?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "আইডি দেওয়া হয়নি।",
        });
      }

      let filter = {};
      if (ObjectId.isValid(id)) {
        try {
          filter = { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] };
        } catch {
          filter = { _id: String(id) };
        }
      } else {
        filter = { staffId: id };
      }

      await staffCollection.deleteOne(filter);

      res.status(200).json({
        success: true,
        message: "স্টাফ সফলভাবে ডিলিট করা হয়েছে!",
      });
    } catch (error) {
      console.error("DELETE /api/admin/staff error:", error);
      res.status(500).json({
        success: false,
        message: "স্টাফ ডিলিট করতে ব্যর্থ হয়েছে।",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = staffRoutes;
