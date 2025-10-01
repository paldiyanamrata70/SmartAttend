const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smartattend', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB connected');

  // Add test users if database is empty
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Adding test users...');

      const testUsers = [
        {
          name: 'John Smith',
          employeeId: 'EMP001',
          email: 'john.smith@company.com',
          faceData: 'test_face_data_1'
        },
        {
          name: 'Sarah Johnson',
          employeeId: 'EMP002',
          email: 'sarah.johnson@company.com',
          faceData: 'test_face_data_2'
        },
        {
          name: 'Mike Davis',
          employeeId: 'EMP003',
          email: 'mike.davis@company.com',
          faceData: 'test_face_data_3'
        }
      ];

      await User.insertMany(testUsers);
      console.log('Test users added successfully');

      // Add some test attendance records
      const attendanceRecords = [];
      const now = new Date();

      for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        testUsers.forEach(user => {
          const checkInTime = new Date(date);
          checkInTime.setHours(8 + Math.random() * 2, Math.random() * 60);

          const status = checkInTime.getHours() >= 9 ? 'late' : 'present';

          attendanceRecords.push({
            employeeId: user.employeeId,
            name: user.name,
            timestamp: checkInTime,
            method: ['face', 'qr', 'card'][Math.floor(Math.random() * 3)],
            status: status,
            location: 'Office',
            ipAddress: '127.0.0.1'
          });
        });
      }

      await Attendance.insertMany(attendanceRecords);
      console.log('Test attendance records added successfully');
    }
  } catch (error) {
    console.error('Error adding test data:', error);
  }
})
.catch(err => console.log('MongoDB connection error:', err));

// Models
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  employeeId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  faceData: { type: String }, // Base64 encoded face image
  role: { type: String, default: 'employee' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
});

const AttendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  method: { type: String, enum: ['face', 'qr', 'card', 'manual'], required: true },
  status: { type: String, enum: ['present', 'late', 'absent'], required: true },
  location: { type: String },
  ipAddress: { type: String },
});

const User = mongoose.model('User', UserSchema);
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// Routes

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-faceData');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Register new user
app.post('/api/users', async (req, res) => {
  try {
    const { name, employeeId, email, faceData } = req.body;

    const existingUser = await User.findOne({
      $or: [{ employeeId }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'User with this employee ID or email already exists'
      });
    }

    const user = new User({ name, employeeId, email, faceData });
    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: { name, employeeId, email }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by employee ID
app.get('/api/users/:employeeId', async (req, res) => {
  try {
    const user = await User.findOne({ employeeId: req.params.employeeId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { employeeId, name, method, status, location, ipAddress } = req.body;

    // Check if user exists
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already marked attendance today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingAttendance = await Attendance.findOne({
      employeeId,
      timestamp: { $gte: today, $lt: tomorrow }
    });

    if (existingAttendance) {
      return res.status(400).json({
        message: 'Attendance already marked for today',
        attendance: existingAttendance
      });
    }

    const attendance = new Attendance({
      employeeId,
      name,
      method,
      status,
      location,
      ipAddress
    });

    await attendance.save();

    // Update user's last login
    await User.findOneAndUpdate(
      { employeeId },
      { lastLogin: new Date() }
    );

    res.status(201).json({
      message: 'Attendance marked successfully',
      attendance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get attendance records
app.get('/api/attendance', async (req, res) => {
  try {
    const { employeeId, startDate, endDate, limit = 50 } = req.query;

    let query = {};

    if (employeeId) {
      query.employeeId = employeeId;
    }

    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get attendance statistics
app.get('/api/attendance/stats', async (req, res) => {
  try {
    const { employeeId, period = 'month' } = req.query;

    let startDate = new Date();

    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    let matchQuery = { timestamp: { $gte: startDate } };
    if (employeeId) {
      matchQuery.employeeId = employeeId;
    }

    const stats = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          },
          lateDays: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalDays: 0,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0
    };

    result.attendanceRate = result.totalDays > 0
      ? Math.round((result.presentDays / result.totalDays) * 100)
      : 0;

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's attendance
    const todayAttendance = await Attendance.find({
      timestamp: { $gte: today, $lt: tomorrow }
    }).sort({ timestamp: -1 });

    // Total users
    const totalUsers = await User.countDocuments();

    // Recent attendance (last 10)
    const recentAttendance = await Attendance.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('user', 'name employeeId');

    res.json({
      todayAttendance,
      totalUsers,
      recentAttendance,
      todayStats: {
        total: todayAttendance.length,
        present: todayAttendance.filter(a => a.status === 'present').length,
        late: todayAttendance.filter(a => a.status === 'late').length,
        absent: totalUsers - todayAttendance.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Face recognition endpoint (mock implementation)
app.post('/api/face/recognize', async (req, res) => {
  try {
    const { faceData } = req.body;

    // In a real implementation, you would:
    // 1. Process the face image
    // 2. Compare with stored face data
    // 3. Return matched user

    // For demo purposes, return a user based on faceData hash for consistency
    const mockUsers = await User.find().limit(5);
    if (mockUsers.length > 0) {
      // Use faceData to deterministically pick a user
      const hash = faceData.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      const userIndex = Math.abs(hash) % mockUsers.length;
      const matchedUser = mockUsers[userIndex];

      res.json({
        success: true,
        user: {
          name: matchedUser.name,
          employeeId: matchedUser.employeeId
        },
        confidence: Math.random() * 0.3 + 0.7 // 70-100% confidence
      });
    } else {
      res.json({
        success: false,
        message: 'No face recognized'
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});