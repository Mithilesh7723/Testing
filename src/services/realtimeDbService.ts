import { 
  ref, 
  set, 
  get, 
  update, 
  remove, 
  push, 
  query, 
  orderByChild, 
  equalTo, 
  onValue, 
  off, 
  DatabaseReference, 
  DataSnapshot 
} from 'firebase/database';
import { realtimeDb } from '../config/firebase';
import { User, Employee, Goal, Feedback, Department, PerformanceMetric, Notification, AdminRating } from '../types/models';

// Utility function to handle database errors
const handleDatabaseError = (error: any, operation: string): never => {
  // Check for index errors
  if (error.message && error.message.includes('Index not defined')) {
    const indexMatch = error.message.match(/add ".indexOn": "([^"]+)".*path "([^"]+)"/);
    if (indexMatch) {
      const [_, indexField, path] = indexMatch;
      console.error(`Firebase Database index error: Add ".indexOn": "${indexField}" for path "${path}" in your database rules.`);
      console.error(`To fix this, update your database.rules.json file with appropriate indexing rules.`);
    }
  }
  
  // Log the error with context
  console.error(`Database operation failed: ${operation}`, error);
  
  // Rethrow with useful information
  throw error;
};

// User Management
export const createUser = async (userId: string, userData: any): Promise<void> => {
  const userRef = ref(realtimeDb, `users/${userId}`);
  await set(userRef, userData);
};

export const getUserById = async (userId: string) => {
  const userRef = ref(realtimeDb, `users/${userId}`);
  const snapshot = await get(userRef);
  return snapshot.exists() ? snapshot.val() : null;
};

// Employee Management
export const getAllEmployees = async (): Promise<Employee[]> => {
  console.log("getAllEmployees called");
  const employeesRef = ref(realtimeDb, 'employees');
  console.log("Reference created for 'employees' path");
  
  try {
    const snapshot = await get(employeesRef);
    console.log("Snapshot received, exists:", snapshot.exists());
    
    if (!snapshot.exists()) {
      console.log("No employees found in database");
      return [];
    }
    
    const employees = snapshot.val();
    console.log("Raw employees data:", employees);
    
    const formattedEmployees = Object.keys(employees).map(key => ({
      ...employees[key],
      id: key
    }));
    
    console.log("Formatted employees:", formattedEmployees.length);
    return formattedEmployees;
  } catch (error) {
    console.error("Error in getAllEmployees:", error);
    throw error;
  }
};

export const getEmployeeById = async (employeeId: string): Promise<Employee | null> => {
  const employeeRef = ref(realtimeDb, `employees/${employeeId}`);
  const snapshot = await get(employeeRef);
  return snapshot.exists() ? snapshot.val() : null;
};

export const getEmployeeByUserId = async (userId: string): Promise<Employee | null> => {
  try {
    try {
      // Try to use the indexed query first
      const employeesRef = ref(realtimeDb, 'employees');
      const employeeQuery = query(employeesRef, orderByChild('userId'), equalTo(userId));
      const snapshot = await get(employeeQuery);
      
      if (snapshot.exists()) {
        const employees = snapshot.val();
        const employeeId = Object.keys(employees)[0];
        return { ...employees[employeeId], id: employeeId };
      }
      
      return null;
    } catch (indexError) {
      console.log('Index error detected, falling back to non-indexed query method');
      // Fall back to the non-indexed method if there's an index error
      return getEmployeeByUserIdFallback(userId);
    }
  } catch (error) {
    return handleDatabaseError(error, `Get employee by userId: ${userId}`);
  }
};

// Fallback function that doesn't rely on indexed queries
export const getEmployeeByUserIdFallback = async (userId: string): Promise<Employee | null> => {
  try {
    // Get all employees
    const employeesRef = ref(realtimeDb, 'employees');
    const snapshot = await get(employeesRef);
    
    if (!snapshot.exists()) return null;
    
    // Manually filter to find the employee with matching userId
    const employees = snapshot.val();
    for (const employeeId in employees) {
      if (employees[employeeId].userId === userId) {
        return { ...employees[employeeId], id: employeeId };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error in getEmployeeByUserIdFallback:', error);
    throw error;
  }
};

export const createEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee> => {
  const employeesRef = ref(realtimeDb, 'employees');
  const newEmployeeRef = push(employeesRef);
  const employeeId = newEmployeeRef.key as string;
  
  const employee: Employee = {
    ...employeeData,
    id: employeeId,
    createdAt: employeeData.createdAt || new Date(),
    updatedAt: employeeData.updatedAt || new Date()
  };
  
  await set(newEmployeeRef, employee);
  return employee;
};

export const updateEmployee = async (employeeId: string, updates: Partial<Employee>): Promise<void> => {
  const employeeRef = ref(realtimeDb, `employees/${employeeId}`);
  await update(employeeRef, { ...updates, updatedAt: new Date() });
};

export const deleteEmployee = async (id: string): Promise<void> => {
  try {
    const employeeRef = ref(realtimeDb, `employees/${id}`);
    await remove(employeeRef);
  } catch (error) {
    console.error('Error deleting employee:', error);
    throw error;
  }
};

// Goals Management
export const getGoalsByEmployeeId = async (employeeId: string): Promise<Goal[]> => {
  const goalsRef = ref(realtimeDb, 'goals');
  const goalQuery = query(goalsRef, orderByChild('employeeId'), equalTo(employeeId));
  const snapshot = await get(goalQuery);
  
  if (!snapshot.exists()) return [];
  
  const goals = snapshot.val();
  return Object.keys(goals).map(key => ({
    ...goals[key],
    id: key
  }));
};

export const getAllGoals = async (): Promise<Goal[]> => {
  try {
    const goalsRef = ref(realtimeDb, 'goals');
    const snapshot = await get(goalsRef);
    
    if (snapshot.exists()) {
      const goalsData = snapshot.val();
      return Object.keys(goalsData).map(key => ({
        id: key,
        ...goalsData[key]
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error getting all goals:', error);
    throw error;
  }
};

export const createGoal = async (goalData: Omit<Goal, 'id'>): Promise<Goal> => {
  const goalsRef = ref(realtimeDb, 'goals');
  const newGoalRef = push(goalsRef);
  const goalId = newGoalRef.key as string;
  
  // Ensure all date fields are properly formatted as ISO strings
  const formattedGoalData = {
    ...goalData,
    // Convert Date objects to ISO strings for consistency
    targetDate: goalData.targetDate instanceof Date 
      ? goalData.targetDate.toISOString() 
      : typeof goalData.targetDate === 'string' 
        ? new Date(goalData.targetDate).toISOString() 
        : new Date().toISOString(),
    createdAt: goalData.createdAt instanceof Date 
      ? goalData.createdAt.toISOString() 
      : new Date().toISOString(),
    updatedAt: goalData.updatedAt instanceof Date 
      ? goalData.updatedAt.toISOString() 
      : new Date().toISOString()
  };
  
  const goal: Goal = {
    ...formattedGoalData,
    id: goalId
  };
  
  console.log('Creating goal with formatted dates:', goal);
  
  await set(newGoalRef, goal);
  
  // Create notification for the employee
  try {
    // Get employee data to get the user ID
    const employeeRef = ref(realtimeDb, `employees/${goalData.employeeId}`);
    const employeeSnapshot = await get(employeeRef);
    
    if (employeeSnapshot.exists()) {
      const employee = employeeSnapshot.val();
      
      if (employee.userId) {
        await createNotification({
          userId: employee.userId,
          title: 'New Goal Assigned',
          message: `A new goal has been assigned to you: ${goalData.title}`,
          type: 'goal',
          read: false,
          createdAt: new Date(),
          relatedItemId: goalId,
          relatedItemType: 'goal'
        });
      }
    }
  } catch (error) {
    console.error('Error creating notification for goal:', error);
    // Don't throw here - we don't want to fail the goal creation if notification fails
  }
  
  return goal;
};

export const updateGoal = async (goalId: string, updates: Partial<Goal>): Promise<void> => {
  const goalRef = ref(realtimeDb, `goals/${goalId}`);
  
  // Format any date fields to ensure consistency
  const formattedUpdates = { ...updates };
  
  // Handle targetDate if it's being updated
  if (updates.targetDate) {
    formattedUpdates.targetDate = updates.targetDate instanceof Date 
      ? updates.targetDate.toISOString() 
      : typeof updates.targetDate === 'string'
        ? new Date(updates.targetDate).toISOString()
        : updates.targetDate;
  }
  
  // Always update the updatedAt timestamp
  formattedUpdates.updatedAt = new Date().toISOString();
  
  console.log('Updating goal with formatted dates:', formattedUpdates);
  
  await update(goalRef, formattedUpdates);
};

export const deleteGoal = async (id: string): Promise<void> => {
  try {
    const goalRef = ref(realtimeDb, `goals/${id}`);
    await remove(goalRef);
  } catch (error) {
    console.error('Error deleting goal:', error);
    throw error;
  }
};

// Feedback Management
export const getFeedbacksByEmployeeId = async (employeeId: string): Promise<Feedback[]> => {
  const feedbacksRef = ref(realtimeDb, 'feedbacks');
  const feedbackQuery = query(feedbacksRef, orderByChild('employeeId'), equalTo(employeeId));
  const snapshot = await get(feedbackQuery);
  
  if (!snapshot.exists()) return [];
  
  const feedbacks = snapshot.val();
  return Object.keys(feedbacks).map(key => ({
    ...feedbacks[key],
    id: key
  }));
};

export const getAllFeedbacks = async (): Promise<Feedback[]> => {
  try {
    const feedbacksRef = ref(realtimeDb, 'feedbacks');
    const snapshot = await get(feedbacksRef);
    
    if (snapshot.exists()) {
      const feedbacksData = snapshot.val();
      return Object.keys(feedbacksData).map(key => ({
        id: key,
        ...feedbacksData[key]
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error getting all feedbacks:', error);
    throw error;
  }
};

export const createFeedback = async (feedbackData: Omit<Feedback, 'id'>): Promise<Feedback> => {
  const feedbacksRef = ref(realtimeDb, 'feedbacks');
  const newFeedbackRef = push(feedbacksRef);
  const feedbackId = newFeedbackRef.key as string;
  
  // Ensure createdAt is a proper date string
  const createdAt = feedbackData.createdAt instanceof Date 
    ? feedbackData.createdAt.toISOString() 
    : new Date().toISOString();
  
  const feedback: Feedback = {
    ...feedbackData,
    id: feedbackId,
    createdAt
  };
  
  await set(newFeedbackRef, feedback);
  
  try {
    // Handle feedback notifications based on type
    if (feedbackData.category?.startsWith('request-')) {
      console.log('Processing feedback request notification for admins');
      
      // Workaround for the indexOn issue - get all users and filter on the client side
      // This avoids the need for a Firebase index
      const usersRef = ref(realtimeDb, 'users');
      const allUsersSnapshot = await get(usersRef);
      
      if (allUsersSnapshot.exists()) {
        // Get employee details for the notification
        let employeeName = feedbackData.requestedBy || 'An employee';
        if (feedbackData.employeeId) {
          try {
            const employeeRef = ref(realtimeDb, `employees/${feedbackData.employeeId}`);
            const employeeSnapshot = await get(employeeRef);
            if (employeeSnapshot.exists()) {
              const employee = employeeSnapshot.val();
              employeeName = employee.name || employeeName;
            }
          } catch (err) {
            console.error('Error getting employee details for notification:', err);
          }
        }
        
        // Filter admin users on the client side
        const allUsers = allUsersSnapshot.val();
        const adminUsers = Object.entries(allUsers)
          .filter(([_, user]: [string, any]) => user.role === 'admin')
          .map(([id, _]: [string, any]) => id);
        
        console.log(`Found ${adminUsers.length} admin users to notify`);
        
        // Create notification for each admin
        const notificationPromises = adminUsers.map(adminId => {
          console.log(`Creating notification for admin: ${adminId}`);
          return createNotification({
            userId: adminId,
            title: 'New Feedback Request',
            message: `${employeeName} has requested ${feedbackData.category.replace('request-', '')} feedback`,
            type: 'request',
            read: false,
            createdAt: new Date(),
            relatedItemId: feedbackId,
            relatedItemType: 'feedback'
          });
        });
        
        await Promise.all(notificationPromises);
        console.log(`Created notifications for ${notificationPromises.length} admins`);
      } else {
        console.log('No users found for notifications');
      }
    } else if (feedbackData.employeeId) {
      // Regular feedback given to an employee
      // Create notification for the employee
      try {
        const employeeRef = ref(realtimeDb, `employees/${feedbackData.employeeId}`);
        const employeeSnapshot = await get(employeeRef);
        
        if (employeeSnapshot.exists()) {
          const employee = employeeSnapshot.val();
          if (employee.userId) {
            await createNotification({
              userId: employee.userId,
              title: 'New Feedback',
              message: `You've received new feedback from ${feedbackData.reviewerName || 'your manager'}`,
              type: 'feedback',
              read: false,
              createdAt: new Date(),
              relatedItemId: feedbackId,
              relatedItemType: 'feedback'
            });
          }
        }
      } catch (err) {
        console.error('Error creating notification for employee:', err);
      }
    }
  } catch (error) {
    console.error('Error handling notifications for feedback:', error);
    // Don't throw error to avoid failing the feedback creation
  }
  
  return feedback;
};

export const updateFeedback = async (id: string, data: Partial<Feedback>): Promise<void> => {
  try {
    const feedbackRef = ref(realtimeDb, `feedbacks/${id}`);
    await update(feedbackRef, data);
  } catch (error) {
    console.error('Error updating feedback:', error);
    throw error;
  }
};

export const deleteFeedback = async (id: string): Promise<void> => {
  try {
    const feedbackRef = ref(realtimeDb, `feedbacks/${id}`);
    await remove(feedbackRef);
  } catch (error) {
    console.error('Error deleting feedback:', error);
    throw error;
  }
};

// Real-time listeners
export const subscribeToEmployee = (
  employeeId: string, 
  callback: (employee: Employee | null) => void
): () => void => {
  const employeeRef = ref(realtimeDb, `employees/${employeeId}`);
  
  const handleSnapshot = (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      callback({
        id: employeeId,
        ...snapshot.val()
      });
    } else {
      callback(null);
    }
  };
  
  onValue(employeeRef, handleSnapshot);
  
  // Return unsubscribe function
  return () => off(employeeRef);
};

// Fallback subscription function for goals that doesn't rely on indexes
export const subscribeToGoalsFallback = (employeeId: string, callback: (goals: Goal[]) => void) => {
  const goalsRef = ref(realtimeDb, 'goals');
  
  const listener = onValue(goalsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const goalsData = snapshot.val();
    const formattedGoals = Object.keys(goalsData)
      .filter(key => goalsData[key].employeeId === employeeId)
      .map(key => ({
        ...goalsData[key],
        id: key
      }));
    
    callback(formattedGoals);
  });
  
  // Return a function to unsubscribe
  return () => off(goalsRef, 'value');
};

// Updated subscribeToGoals function with fallback
export const subscribeToGoals = (employeeId: string, callback: (goals: Goal[]) => void) => {
  try {
    const goalsRef = ref(realtimeDb, 'goals');
    const goalQuery = query(goalsRef, orderByChild('employeeId'), equalTo(employeeId));
    
    const listener = onValue(goalQuery, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      
      const goals = snapshot.val();
      const formattedGoals = Object.keys(goals).map(key => ({
        ...goals[key],
        id: key
      }));
      
      callback(formattedGoals);
    }, (error) => {
      console.error("Goals subscription error, falling back to unindexed method:", error);
      // If there's an error with the indexed query, use the fallback
      return subscribeToGoalsFallback(employeeId, callback);
    });
    
    // Return a function to unsubscribe
    return () => off(goalQuery, 'value');
  } catch (error) {
    console.error("Error setting up goals subscription, using fallback:", error);
    return subscribeToGoalsFallback(employeeId, callback);
  }
};

// Fallback subscription function for feedbacks that doesn't rely on indexes
export const subscribeToFeedbacksFallback = (employeeId: string, callback: (feedbacks: Feedback[]) => void) => {
  const feedbacksRef = ref(realtimeDb, 'feedbacks');
  
  const listener = onValue(feedbacksRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const feedbacksData = snapshot.val();
    const formattedFeedbacks = Object.keys(feedbacksData)
      .filter(key => feedbacksData[key].employeeId === employeeId)
      .map(key => ({
        ...feedbacksData[key],
        id: key
      }));
    
    callback(formattedFeedbacks);
  });
  
  // Return a function to unsubscribe
  return () => off(feedbacksRef, 'value');
};

// Updated subscribeToFeedbacks function with fallback
export const subscribeToFeedbacks = (employeeId: string, callback: (feedbacks: Feedback[]) => void) => {
  try {
    const feedbacksRef = ref(realtimeDb, 'feedbacks');
    const feedbackQuery = query(feedbacksRef, orderByChild('employeeId'), equalTo(employeeId));
    
    const listener = onValue(feedbackQuery, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      
      const feedbacks = snapshot.val();
      const formattedFeedbacks = Object.keys(feedbacks).map(key => ({
        ...feedbacks[key],
        id: key
      }));
      
      callback(formattedFeedbacks);
    }, (error) => {
      console.error("Feedbacks subscription error, falling back to unindexed method:", error);
      // If there's an error with the indexed query, use the fallback
      return subscribeToFeedbacksFallback(employeeId, callback);
    });
    
    // Return a function to unsubscribe
    return () => off(feedbackQuery, 'value');
  } catch (error) {
    console.error("Error setting up feedbacks subscription, using fallback:", error);
    return subscribeToFeedbacksFallback(employeeId, callback);
  }
};

// Performance Metrics Management
export const createPerformanceMetric = async (metricData: Omit<PerformanceMetric, 'id'>): Promise<PerformanceMetric> => {
  const metricsRef = ref(realtimeDb, 'performanceMetrics');
  const newMetricRef = push(metricsRef);
  const metricId = newMetricRef.key as string;
  
  const metric: PerformanceMetric = {
    ...metricData,
    id: metricId,
    date: metricData.date || new Date()
  };
  
  await set(newMetricRef, metric);
  
  // Create notification for the employee
  try {
    // Get employee data to get the user ID
    const employeeRef = ref(realtimeDb, `employees/${metricData.employeeId}`);
    const employeeSnapshot = await get(employeeRef);
    
    if (employeeSnapshot.exists()) {
      const employee = employeeSnapshot.val();
      
      if (employee.userId) {
        await createNotification({
          userId: employee.userId,
          title: 'Performance Update',
          message: `Your ${metricData.metric} performance has been updated to ${metricData.value}%`,
          type: 'review',
          read: false,
          createdAt: new Date(),
          relatedItemId: metricId,
          relatedItemType: 'metric'
        });
      }
    }
  } catch (error) {
    console.error('Error creating notification for performance metric:', error);
    // Don't throw here - we don't want to fail the metric creation if notification fails
  }
  
  return metric;
};

export const getPerformanceMetricsByEmployeeId = async (employeeId: string): Promise<PerformanceMetric[]> => {
  const metricsRef = ref(realtimeDb, 'performanceMetrics');
  const metricsQuery = query(metricsRef, orderByChild('employeeId'), equalTo(employeeId));
  const snapshot = await get(metricsQuery);
  
  if (!snapshot.exists()) return [];
  
  const metrics = snapshot.val();
  return Object.keys(metrics).map(key => ({
    ...metrics[key],
    id: key
  }));
};

// Fallback subscription function for performance metrics that doesn't rely on indexes
export const subscribeToPerformanceMetricsFallback = (employeeId: string, callback: (metrics: PerformanceMetric[]) => void) => {
  const metricsRef = ref(realtimeDb, 'performanceMetrics');
  
  const listener = onValue(metricsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const metricsData = snapshot.val();
    const formattedMetrics = Object.keys(metricsData)
      .filter(key => metricsData[key].employeeId === employeeId)
      .map(key => ({
        ...metricsData[key],
        id: key
      }));
    
    callback(formattedMetrics);
  });
  
  // Return a function to unsubscribe
  return () => off(metricsRef, 'value');
};

// Updated subscribeToPerformanceMetrics function with fallback
export const subscribeToPerformanceMetrics = (employeeId: string, callback: (metrics: PerformanceMetric[]) => void) => {
  try {
    const metricsRef = ref(realtimeDb, 'performanceMetrics');
    const metricsQuery = query(metricsRef, orderByChild('employeeId'), equalTo(employeeId));
    
    const listener = onValue(metricsQuery, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      
      const metrics = snapshot.val();
      const formattedMetrics = Object.keys(metrics).map(key => ({
        ...metrics[key],
        id: key
      }));
      
      callback(formattedMetrics);
    }, (error) => {
      console.error("Performance metrics subscription error, falling back to unindexed method:", error);
      // If there's an error with the indexed query, use the fallback
      return subscribeToPerformanceMetricsFallback(employeeId, callback);
    });
    
    // Return unsubscribe function
    return () => off(metricsQuery);
  } catch (error) {
    console.error("Error setting up performance metrics subscription, using fallback:", error);
    return subscribeToPerformanceMetricsFallback(employeeId, callback);
  }
};

// New Notification interface
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'feedback' | 'goal' | 'review' | 'request' | 'system';
  read: boolean;
  createdAt: any; // Firebase timestamp
  relatedItemId?: string;
  relatedItemType?: string;
}

// Create a new notification
export const createNotification = async (notificationData: Omit<Notification, 'id'>): Promise<Notification> => {
  const notificationsRef = ref(realtimeDb, 'notifications');
  const newNotificationRef = push(notificationsRef);
  const notificationId = newNotificationRef.key as string;
  
  // Ensure createdAt is a proper date string
  const createdAt = notificationData.createdAt instanceof Date 
    ? notificationData.createdAt.toISOString() 
    : new Date().toISOString();
  
  const notification: Notification = {
    ...notificationData,
    id: notificationId,
    createdAt
  };
  
  await set(newNotificationRef, notification);
  return notification;
};

// Get all notifications for a specific user
export const getNotificationsByUserId = async (userId: string): Promise<Notification[]> => {
  const notificationsRef = ref(realtimeDb, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    orderByChild('userId'),
    equalTo(userId)
  );
  
  const snapshot = await get(notificationsQuery);
  if (!snapshot.exists()) return [];
  
  const notifications: Notification[] = [];
  snapshot.forEach((childSnapshot) => {
    const notification = childSnapshot.val() as Notification;
    notifications.push(notification);
  });
  
  // Sort by creation date, newest first
  return notifications.sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });
};

// Mark a notification as read
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  const notificationRef = ref(realtimeDb, `notifications/${notificationId}`);
  await update(notificationRef, { read: true });
};

// Mark all notifications for a user as read
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  const notifications = await getNotificationsByUserId(userId);
  
  const updatePromises = notifications
    .filter(notification => !notification.read)
    .map(notification => 
      update(ref(realtimeDb, `notifications/${notification.id}`), { read: true })
    );
  
  await Promise.all(updatePromises);
};

// Subscribe to notifications for a user
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void => {
  const notificationsRef = ref(realtimeDb, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    orderByChild('userId'),
    equalTo(userId)
  );
  
  const unsubscribe = onValue(notificationsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const notifications: Notification[] = [];
    snapshot.forEach((childSnapshot) => {
      const notification = childSnapshot.val() as Notification;
      notifications.push(notification);
    });
    
    // Sort by creation date, newest first
    callback(notifications.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    }));
  });
  
  return unsubscribe;
};

// Function to generate demo notifications for testing
export const generateDemoNotifications = async (userId: string): Promise<void> => {
  const notificationTypes = ['feedback', 'goal', 'review', 'request', 'system'];
  const notificationTitles = {
    feedback: ['New Feedback', 'Feedback Response', 'Team Feedback'],
    goal: ['Goal Update', 'Goal Assigned', 'Goal Completed'],
    review: ['Review Submitted', 'Performance Review', 'Quarterly Review'],
    request: ['Feedback Request', 'Document Request', 'Meeting Request'],
    system: ['Account Update', 'System Maintenance', 'Profile Update']
  };
  const notificationMessages = {
    feedback: [
      'Your team leader has provided feedback on your recent project.',
      'Your recent work has been recognized by management.',
      'A colleague has shared feedback on your presentation.'
    ],
    goal: [
      'A new goal has been assigned to you for this quarter.',
      'Your goal "Improve Customer Service" is due next week.',
      'You have completed 3 of your 5 assigned goals.'
    ],
    review: [
      'Your annual performance review is now available.',
      'Your manager has submitted a new quarterly review.',
      'Your 360° feedback is ready for your review.'
    ],
    request: [
      'A team member has requested your feedback on their project.',
      'Your manager has requested a project status update.',
      'The HR department requests your updated information.'
    ],
    system: [
      'Welcome to the new employee feedback system.',
      'Your account has been successfully updated.',
      'System maintenance scheduled for this weekend.'
    ]
  };
  
  // Create 5 demo notifications with different types and read status
  const notificationPromises = [];
  
  for (let i = 0; i < 5; i++) {
    const type = notificationTypes[i % notificationTypes.length] as 'feedback' | 'goal' | 'review' | 'request' | 'system';
    const titleIndex = Math.floor(Math.random() * notificationTitles[type].length);
    const messageIndex = Math.floor(Math.random() * notificationMessages[type].length);
    
    const timeOffset = Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000); // Random time within last week
    
    notificationPromises.push(
      createNotification({
        userId: userId,
        title: notificationTitles[type][titleIndex],
        message: notificationMessages[type][messageIndex],
        type: type,
        read: i > 2, // First 3 unread, last 2 read
        createdAt: new Date(Date.now() - timeOffset)
      })
    );
  }
  
  await Promise.all(notificationPromises);
};

// Add this function to subscribe to real-time updates for all employees
export const subscribeToEmployees = (callback: (employees: Employee[]) => void): (() => void) => {
  const employeesRef = ref(realtimeDb, 'employees');
  
  console.log("Setting up real-time subscription to employees");
  
  // Set up the listener
  const handleEmployeesUpdate = (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      const employeesData = snapshot.val();
      const formattedEmployees = Object.keys(employeesData).map(key => ({
        ...employeesData[key],
        id: key
      }));
      
      console.log(`Real-time employees update: ${formattedEmployees.length} employees`);
      callback(formattedEmployees);
    } else {
      console.log("No employees found in database during real-time update");
      callback([]);
    }
  };
  
  // Register the listener
  onValue(employeesRef, handleEmployeesUpdate);
  
  // Return the unsubscribe function
  return () => {
    console.log("Unsubscribing from employees real-time updates");
    off(employeesRef, 'value', handleEmployeesUpdate);
  };
};

// Admin Rating Management
export const createAdminRating = async (ratingData: Omit<AdminRating, 'id'>): Promise<AdminRating> => {
  const ratingsRef = ref(realtimeDb, 'adminRatings');
  const newRatingRef = push(ratingsRef);
  const ratingId = newRatingRef.key as string;
  
  // Format date
  const createdAt = ratingData.createdAt instanceof Date 
    ? ratingData.createdAt.toISOString() 
    : new Date().toISOString();
  
  const rating: AdminRating = {
    ...ratingData,
    id: ratingId,
    createdAt: new Date(createdAt)
  };
  
  await set(newRatingRef, rating);
  
  // Create notification for the admin
  try {
    await createNotification({
      userId: ratingData.adminId,
      title: 'New Leadership Rating',
      message: 'You received new feedback on your leadership',
      type: 'rating',
      read: false,
      createdAt: new Date(),
      relatedItemId: ratingId,
      relatedItemType: 'adminRating'
    });
  } catch (error) {
    console.error('Error creating notification for admin rating:', error);
    // Don't throw here - we don't want to fail the rating creation if notification fails
  }
  
  return rating;
};

export const getAdminRatingsByAdminId = async (adminId: string): Promise<AdminRating[]> => {
  try {
    const ratingsRef = ref(realtimeDb, 'adminRatings');
    const ratingQuery = query(ratingsRef, orderByChild('adminId'), equalTo(adminId));
    const snapshot = await get(ratingQuery);
    
    if (!snapshot.exists()) return [];
    
    const ratings = snapshot.val();
    return Object.keys(ratings).map(key => ({
      ...ratings[key],
      id: key,
      // Convert ISO string to Date object if needed
      createdAt: new Date(ratings[key].createdAt)
    }));
  } catch (error) {
    console.error('Error getting admin ratings:', error);
    throw error;
  }
};

export const getAdminRatingsByEmployeeId = async (employeeId: string): Promise<AdminRating[]> => {
  try {
    const ratingsRef = ref(realtimeDb, 'adminRatings');
    const ratingQuery = query(ratingsRef, orderByChild('employeeId'), equalTo(employeeId));
    const snapshot = await get(ratingQuery);
    
    if (!snapshot.exists()) return [];
    
    const ratings = snapshot.val();
    return Object.keys(ratings).map(key => ({
      ...ratings[key],
      id: key,
      // Convert ISO string to Date object if needed
      createdAt: new Date(ratings[key].createdAt)
    }));
  } catch (error) {
    console.error('Error getting admin ratings:', error);
    throw error;
  }
};