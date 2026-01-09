import Admin from '../models/admin.js';

/**
 * Helper to log admin activity
 */
export const logAdminActivity = async (adminId, action, details, targetId = null) => {
  try {
    if (!adminId) return;
    
    await Admin.findByIdAndUpdate(adminId, {
      $push: {
        activities: {
          action,
          details,
          targetId,
          created_at: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Error logging admin activity:', error);
  }
};
