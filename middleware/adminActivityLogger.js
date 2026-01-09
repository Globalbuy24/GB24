import Admin from '../models/admin.js';

/**
 * Helper to log admin activity
 */
export const logAdminActivity = async (adminId, action, details, targetId = null) => {
  try {
    if (!adminId) return;
    const admin = await Admin.findById(adminId);
    if (admin) {
      admin.activities.push({
        action,
        details,
        targetId,
        created_at: new Date()
      });
      await admin.save();
    }
  } catch (error) {
    console.error('Error logging admin activity:', error);
  }
};
