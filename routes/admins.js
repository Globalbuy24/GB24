import express from 'express';
const router = express.Router();
import Admin from '../models/admin.js';
import User from '../models/user.js';
import Category from '../models/category.js';
import SystemDefault from '../models/system_default.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import authenticate from '../middleware/currentUser.js';
import authenticateAdmin from '../middleware/currentAdminOnWeb.js';
import axios from 'axios';
import translate from '../middleware/translator.js';
import { logAdminActivity } from '../middleware/adminActivityLogger.js';
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  isWithinInterval, 
  format, 
  eachDayOfInterval,
  subDays
} from 'date-fns';

// currency converter
const CC_API_KEY = '1e06667412357fb0c88dacd6'; // Replace with your API key
const CC_BASE_URL = 'https://v6.exchangerate-api.com/v6'; // Modify this based on the API service you choose

/**
 * Creating a new admin (Public/Initial)
 */
router.post('/', async (req, res) => {
  const admin = new Admin({
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    email: req.body.email,
    type: req.body.type,
    phone_number: req.body.phone_number,
    password: req.body.password,
    status: req.body.status || 'active'
  });
  try {
    if (req.body.email != null || req.body.phone_number != null) {
      let admins = await Admin.find({
        $or: [{ email: req.body.email }, { phone_number: req.body.phone_number }]
      });
      if (admins.length > 0) {
        for (const admin of admins) {
          if (admin.email != null && admin.email === req.body.email) {
            return res.status(400).json({ message: 'Email already exist' });
          } else if (admin.phone_number != null && admin.phone_number === req.body.phone_number) {
            return res.status(400).json({ message: 'Phone number already exist' });
          }
        }
      }
    }

    const jwt_secret = process.env.JWT_SECRET || 'jwt_gb24_secret';
    const token = jwt.sign({ data: admin.id }, jwt_secret, { expiresIn: '12h' });

    const welcomeNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: 'welcome',
      message: `GB24 welcomes you, ${req.body.first_name} ${req.body.last_name}. Enjoy your ride with us.`,
      created_at: formatDateTime(new Date())
    };

    admin.notifications.push(welcomeNotification);
    admin.token = token;
    const newAdmin = await admin.save();
    res.status(201).json(newAdmin);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Admin creating another admin
 */
router.post('/create-admin', authenticateAdmin, async (req, res) => {
  const { first_name, last_name, email, phone_number, password, type, status } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is mandatory' });
  }

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    const newAdmin = new Admin({
      first_name,
      last_name,
      email,
      phone_number,
      password,
      type,
      status: status || 'active'
    });

    await newAdmin.save();

    // Log activity
    await logAdminActivity(
      req.user.id,
      'CREATE_ADMIN',
      `Created new admin: ${first_name} ${last_name} (${email})`,
      newAdmin._id
    );

    res.status(201).json({ message: 'Admin created successfully', admin: newAdmin });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Get all admins
 */
router.get('/all-admins', authenticateAdmin, async (req, res) => {
  try {
    const admins = await Admin.find({}, '-password');
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get all admin activities
 */
router.get('/activities', authenticateAdmin, async (req, res) => {
  try {
    const admins = await Admin.find({}, 'first_name last_name email activities');
    const allActivities = [];

    admins.forEach((admin) => {
      if (admin.activities) {
        admin.activities.forEach((activity) => {
          allActivities.push({
            adminName: `${admin.first_name} ${admin.last_name}`,
            adminEmail: admin.email,
            ...activity.toObject(),
          });
        });
      }
    });

    // Sort by date descending
    allActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(allActivities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Login admin
 */
router.post('/login', async (req, res) => {
  const credential = req.body.credential;
  const password = req.body.password;
  try {
    if (credential != '' && password != '') {
      let admin = await Admin.findOne({ $or: [{ 'email': credential }, { 'phone_number': credential }] });
      if (admin != null) {
        if (bcrypt.compareSync(password, admin.password)) {
          const jwt_secret = process.env.JWT_SECRET || 'jwt_gb24_secret';
          const token = jwt.sign({ data: admin.id }, jwt_secret, { expiresIn: '12h' });

          await admin.updateOne({ $unset: { token: "" } });
          await admin.updateOne({ $set: { token: token } });
          const updatedUser = await admin.save();

          // Log activity
          await logAdminActivity(admin.id, 'LOGIN', `Admin logged in: ${admin.email}`);

          res.status(200).json({ updatedUser });
        } else {
          res.status(400).json({ message: 'incorrect password' });
        }
      } else {
        res.status(400).json({ message: 'user not found' });
      }
    } else {
      res.status(400).json({ message: 'empty input fields' });
    }
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 * update user basket
 */
router.post('/:uId/updateUserBasket/:bId', authenticate, async (req, res) => {
  const userId = req.params.uId;
  const basketId = req.params.bId;
  const user = await User.findOne({ '_id': userId });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const basket = user.basket.find((basket) => basket.id === basketId);
  if (!basket) {
    return res.status(404).json({ message: 'Basket item not found' });
  }
  try {
    const data = {
      source: basket.product.source,
      name: req.body.name || basket.product.name,
      colour: req.body.colour || basket.product.colour,
      length: req.body.length || basket.product.length,
      width: req.body.width || basket.product.width,
      weight: req.body.weight || basket.product.weight,
      height: req.body.height || basket.product.height,
      price: req.body.price || basket.product.price,
      quantity: req.body.quantity || basket.product.quantity,
      updated_at: formatDateTime(new Date()),
      created_at: basket.product.created_at,
      url: basket.product.url
    };
    if (req.body.weight > 23) {
      basket.delivery_method.name = "Sea Freight";
      basket.delivery_method.delivery_fee = "5 euro";
    } else if (req.body.weight <= 23) {
      basket.delivery_method.name = "Air Freight";
      basket.delivery_method.delivery_fee = "2 euro";
    }

    basket.product = data;
    const basketUpdatedNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: '💲 Quote Ready',
      message: `We've prepared your quote with a full price breakdown. Please review and confirm your order in the app to proceed.`,
      created_at: formatDateTime(new Date())
    };
    user.notifications.push(basketUpdatedNotification);
    const updatedUser = await user.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_USER_BASKET',
      `Updated basket item ${basketId} for user ${userId}`,
      userId
    );

    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 *  Adding system defaults
 */
router.get('/system_default', authenticate, async (req, res) => {
  try {
    const system_default = await SystemDefault.findOne({});
    if (!system_default) {
      return res.status(404).json({ message: "System defaults not found" });
    }
    res.json(system_default);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/system_default', authenticate, async (req, res) => {
  try {
    let system_default = await SystemDefault.findOne({});

    if (!system_default) {
      const newSystemDefault = new SystemDefault();
      system_default = await newSystemDefault.save();
    }

    if (req.body.category.toLowerCase() === "air freight") {
      system_default.delivery_fee.air_freight = req.body.amount;
    } else if (req.body.category.toLowerCase() === "sea freight") {
      system_default.delivery_fee.sea_freight = req.body.amount;
    } else if (req.body.category.toLowerCase() === "referals") {
      system_default.loyalty_points.referals = req.body.amount;
    } else if (req.body.category.toLowerCase() === "purchase") {
      system_default.loyalty_points.purchase = req.body.amount;
    } else if (req.body.category.toLowerCase() === "prohibited") {
      system_default.prohibited.product.push(req.body.product);
    } else if (req.body.category.toLowerCase() === "service fee") {
      const percentage = parseFloat(req.body.percentage);
      const maxValue = parseFloat(req.body.maxValue);

      const newServiceFee = {
        percentage: isNaN(percentage) ? (system_default.service_fee && system_default.service_fee.percentage || 0.00) : percentage,
        maxValue: isNaN(maxValue) ? (system_default.service_fee && system_default.service_fee.maxValue || 0.00) : maxValue,
      };

      system_default.set('service_fee', newServiceFee);
    } else {
      return res.status(400).json({ message: "Invalid category provided" });
    }

    const update = await system_default.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_SYSTEM_DEFAULT',
      `Updated system default category: ${req.body.category}`
    );

    res.json(update);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * add new category
 */
router.post('/categories', authenticate, async (req, res) => {
  try {
    const category = new Category({
      name: req.body.category,
      subtypes: req.body.subtypes
    });

    const cat = await category.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'CREATE_CATEGORY',
      `Created category: ${req.body.category}`,
      cat._id
    );

    res.json(cat);
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 * get all categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find({});
    if (!categories) {
      res.status(400).json({ message: "No Categories found!" });
    }
    res.json(categories);
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 * Add subtype to category
 */
router.post('/category/subtype/:id', authenticate, async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!req.body.name) {
    return res.status(400).json({ message: "Subtype name is required!" });
  }
  if (!category) {
    res.status(400).json({ message: "Category not found!" });
  }
  category.subtypes.push({ name: req.body.name });

  try {
    const newCategory = await category.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'CREATE_SUBTYPE',
      `Added subtype ${req.body.name} to category ${req.params.id}`,
      req.params.id
    );

    res.json(newCategory);
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 * Get subtypes to category
 */
router.get('/category/subtype/:id', async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(400).json({ message: "Category not found!" });
  }
  try {
    res.json(category.subtypes);
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

/**
 * delete category
 */
router.delete('/category/:cid', authenticate, async (req, res) => {
  try {
    const categoryToDelete = await Category.findById(req.params.cid);
    if (!categoryToDelete) {
      return res.status(404).json({ message: 'Category not found' });
    }
    await Category.findByIdAndDelete(req.params.cid);

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'DELETE_CATEGORY',
      `Deleted category ID: ${req.params.cid}`,
      req.params.cid
    );

    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * delete subtype
 */
router.delete('/category/:cid/subtype/:sid', authenticate, async (req, res) => {
  const category = await Category.findById(req.params.cid);
  try {
    const subTypeToDelete = category.subtypes.find((subtype) => subtype.id === req.params.sid);
    if (!subTypeToDelete) {
      res.status(404).json({ error: 'Sub Type not found!' });
      return;
    }
    await subTypeToDelete.deleteOne();
    await category.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'DELETE_SUBTYPE',
      `Deleted subtype ${req.params.sid} from category ${req.params.cid}`,
      req.params.cid
    );

    res.json(200);
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

/**
 * Get all users
 */
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

/**
 * Get all orders
 */
router.get('/allOrders', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    const orders = [];
    users.forEach((user) => {
      const userOrders = user.orders;
      userOrders.forEach((order) => {
        orders.push(order);
      });
    });
    if (!orders) {
      res.status(400).json("No orders found!");
      return;
    }
    res.json(orders);
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

/**
 *  get one order
 */
router.get('/order/:oId', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    const new_order = [];
    users.forEach((user) => {
      user.orders.forEach((order) => {
        if (order.id == req.params.oId) {
          new_order.push(order);
          return;
        }
      });
    });
    if (!new_order) {
      res.status(400).json("Order not found");
      return;
    }
    res.json(new_order);
  } catch (err) {
    res.status(400).json({ message: err });
  }
});

/** 
*  update order status
*/
router.patch('/orderStatus/:oId', authenticate, async (req, res) => {
  try {
    const orderId = req.params.oId;
    const users = await User.find({});
    let updatedUser = null;

    for (const user of users) {
      for (const order of user.orders) {
        if (order.id === orderId) {
          order.status = req.body.status;
          const orderStatusNotification = {
            _id: new mongoose.Types.ObjectId(),
            type: translate(`Order Status Update`, user.settings.language),
            message: translate(`Your order {order_num} status has been updated to {status}.`, user.settings.language, { order_num: order.order_num, status: req.body.status }),
            created_at: formatDateTime(new Date())
          };
          user.notifications.push(orderStatusNotification);
          updatedUser = await user.save();
          break;
        }
      }
      if (updatedUser) break;
    }

    if (updatedUser) {
      // Log activity
      await logAdminActivity(
        req.user.id || req.user.data,
        'UPDATE_ORDER_STATUS',
        `Updated order ${orderId} status to ${req.body.status}`,
        orderId
      );
      res.json(updatedUser);
    } else {
      res.status(404).json({ message: "Order not found" });
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * Toggle order progress
 */
router.patch('/order/:oId/progress', authenticate, async (req, res) => {
  try {
    const { oId } = req.params;
    const { progressItem, status } = req.body;

    if (!progressItem || typeof status === 'undefined') {
      return res.status(400).json({
        message: "Both 'progressItem' and 'status' are required",
      });
    }

    const user = await User.findOne({ "orders._id": oId }).select('settings.language orders.order_num');
    if (!user) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = user.orders.id(oId);
    if (!order.progress.hasOwnProperty(progressItem)) {
      return res.status(404).json({
        message: `Progress item '${progressItem}' not found in order progress`,
      });
    }

    order.progress[progressItem] = status;
    var orderProgressNotification = [];
    if (progressItem == "items_ordered" && status == true) {
      orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`, user.settings.language),
        message: translate(`We have received your order #{order_num} and it is being processed.`, user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    } else if (progressItem == "items_received" && status == true) {
      orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`, user.settings.language),
        message: translate(`Your order #{order_num} has been received at our warehouse.`, user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    } else if (progressItem == "items_shipped" && status == true) {
      orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`, user.settings.language),
        message: translate(`Your order #{order_num} has been shipped.`, user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    } else if (progressItem == "arrived_destination" && status == true) {
      orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`, user.settings.language),
        message: translate(`Your order #{order_num} has arrived at the destination country.`, user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    } else if (progressItem == "ready_for_pickup" && status == true) {
      orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`, user.settings.language),
        message: translate(`Your order #{order_num} is ready for pickup.`, user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    if (orderProgressNotification && Object.keys(orderProgressNotification).length > 0) {
      user.notifications.push(orderProgressNotification);
    }

    await user.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_ORDER_PROGRESS',
      `Updated order ${oId} progress item ${progressItem} to ${status}`,
      oId
    );

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Get Dashboard Statistics
 */
router.get('/dashboard-stats', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    let totalOrders = 0;
    let lastMonthOrders = 0;
    let totalSpent = 0;
    let lastMonthSpent = 0;
    let revenue = 0;
    let lastMonthRevenue = 0;

    const orderDistribution = {
      pending: 0,
      confirmed: 0,
      purchased: 0,
      refunded: 0,
      cancelled: 0
    };

    const monthlyRevenueMap = {};
    const dailySalesMap = {};
    const revenueBySourceMap = {};

    const last30Days = eachDayOfInterval({
      start: subDays(now, 29),
      end: now
    });
    last30Days.forEach(day => {
      dailySalesMap[format(day, 'yyyy-MM-dd')] = 0;
    });

    users.forEach(user => {
      user.orders.forEach(order => {
        const orderDate = new Date(order.created_at);
        const orderAmount = parseFloat(order.total_amount) || 0;
        const isPurchased = order.status === 'purchased';
        const purchaseDate = order.purchase_date ? new Date(order.purchase_date) : null;

        totalOrders++;
        totalSpent += orderAmount;

        if (orderDistribution.hasOwnProperty(order.status)) {
          orderDistribution[order.status]++;
        }

        if (isWithinInterval(orderDate, { start: currentMonthStart, end: currentMonthEnd })) {
          // Current month
        } else if (isWithinInterval(orderDate, { start: lastMonthStart, end: lastMonthEnd })) {
          lastMonthOrders++;
          lastMonthSpent += orderAmount;
        }

        if (isPurchased && purchaseDate) {
          revenue += orderAmount;
          if (isWithinInterval(purchaseDate, { start: lastMonthStart, end: lastMonthEnd })) {
            lastMonthRevenue += orderAmount;
          }
          const monthKey = format(purchaseDate, 'MMM yyyy');
          monthlyRevenueMap[monthKey] = (monthlyRevenueMap[monthKey] || 0) + orderAmount;
          const dayKey = format(purchaseDate, 'yyyy-MM-dd');
          if (dailySalesMap.hasOwnProperty(dayKey)) {
            dailySalesMap[dayKey] += orderAmount;
          }
          order.products.forEach(product => {
            const source = product.source || 'Unknown';
            const productRevenue = (parseFloat(product.price) * product.quantity) || 0;
            revenueBySourceMap[source] = (revenueBySourceMap[source] || 0) + productRevenue;
          });
        }
      });
    });

    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    const currentMonthOrders = totalOrders - lastMonthOrders;
    const currentMonthSpent = totalSpent - lastMonthSpent;
    const currentMonthRevenue = revenue - lastMonthRevenue;

    const monthlyRevenue = Object.keys(monthlyRevenueMap)
      .map(month => ({ month, amount: monthlyRevenueMap[month] }))
      .slice(-6);

    const dailySales = Object.keys(dailySalesMap).map(date => ({
      date,
      amount: dailySalesMap[date]
    }));

    res.json({
      metrics: {
        totalOrders: { value: totalOrders, growth: calculateGrowth(currentMonthOrders, lastMonthOrders), label: "vs last month" },
        totalSpent: { value: totalSpent, growth: calculateGrowth(currentMonthSpent, lastMonthSpent), label: "vs last month" },
        revenue: { value: revenue, growth: calculateGrowth(currentMonthRevenue, lastMonthRevenue), label: "vs last month" },
        growth: { value: calculateGrowth(currentMonthRevenue, lastMonthRevenue), growth: 2.4, label: "vs last month" }
      },
      charts: {
        monthlyRevenue,
        dailySales,
        orderDistribution: Object.keys(orderDistribution).map(status => ({ status, count: orderDistribution[status] })),
        revenueBySource: Object.keys(revenueBySourceMap).map(source => ({
          source,
          revenue: parseFloat(revenueBySourceMap[source].toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue)
      },
      additionalMetrics: {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.orders.length > 0).length,
        averageOrderValue: totalOrders > 0 ? parseFloat((totalSpent / totalOrders).toFixed(2)) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 *  edit one order product
 */
router.patch('/order/:oId/product/:pId', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    const orderId = req.params.oId;
    const productId = req.params.pId;
    const new_order = [];

    for (const user of users) {
      for (const order of user.orders) {
        if (order.id === orderId) {
          new_order.push({ user, order });
        }
      }
    }
    let system_default = await SystemDefault.findOne({});

    if (new_order.length > 0) {
      for (const { user, order } of new_order) {
        let price = 0;
        let delivery_period = 0;
        let totalWeight = 0;

        for (const item of order.products) {
          if (item.id === productId) {
            const itemPrice = await convertCurrency(req.body.price, 'EUR', 'XAF');
            item.source = req.body.source || item.source;
            item.name = req.body.name || item.name;
            item.length = req.body.length || item.length;
            item.width = req.body.width || item.width;
            item.quantity = req.body.quantity || item.quantity;
            item.weight = req.body.weight || item.weight;
            item.height = req.body.height || item.height;
            item.price = itemPrice || item.price;
            item.delivery_time = req.body.delivery_time || item.delivery_time;
            item.canResize = req.body.canResize || item.canResize;
            item.canRecolour = req.body.canRecolour || item.canRecolour;
            item.isRejected = req.body.isRejected || item.isRejected;
          }
          if (item.isRejected == false && item.price) {
            delivery_period += parseInt(item.delivery_time);
            price += parseFloat(item.price) * parseFloat(item.quantity);
            totalWeight += parseFloat(item.weight || 0);
          }
        }
        const deliveryFees_from_admin = system_default.delivery_fee.air_freight ? await convertCurrency(system_default.delivery_fee.air_freight, 'EUR', 'XAF') : system_default.delivery_fee.sea_freight ? await convertCurrency(system_default.delivery_fee.sea_freight, 'EUR', 'XAF') : 0;
        const deliveryFee = parseFloat(deliveryFees_from_admin) * parseFloat(totalWeight);
        order.delivery_method.delivery_fee = deliveryFee.toFixed(1);
        order.estimated_delivery = 2 + Math.ceil(delivery_period / 7);

        const amount1 = price;
        const serviceFeePercentage = parseFloat(system_default.service_fee.percentage);
        const serviceFeeMaxValue = parseFloat(system_default.service_fee.maxValue);
        let calculatedServiceFee = amount1 * (serviceFeePercentage / 100);
        if (calculatedServiceFee > serviceFeeMaxValue) calculatedServiceFee = serviceFeeMaxValue;

        order.service_fee = calculatedServiceFee.toFixed(1);
        order.sub_total = amount1.toFixed(1);
        order.total_amount = parseFloat((parseFloat(amount1) + parseFloat(order.service_fee) + parseFloat(order.delivery_method.delivery_fee)).toFixed(1));

        const updatedUser = await user.save();

        // Log activity
        await logAdminActivity(
          req.user.id || req.user.data,
          'EDIT_ORDER_PRODUCT',
          `Edited product ${productId} in order ${orderId}`,
          orderId
        );

        return res.status(200).json(updatedUser);
      }
    }
    return res.status(404).json({ message: 'Order or product not found' });
  } catch (err) {
    res.status(400).json({ message: 'An error occurred', error: err.message });
  }
});

/**
 * =======================SERVICE_FEES=================================
 */
router.patch('/service_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) {
      const sysDef = new SystemDefault({
        service_fee: {
          percentage: parseFloat(req.body.percentage) || 0.00,
          maxValue: parseFloat(req.body.maxValue) || 0.00
        }
      });
      await sysDef.save();
      return res.status(200).json({ message: "service fees updated" });
    }
    const percentage = parseFloat(req.body.percentage);
    const maxValue = parseFloat(req.body.maxValue);
    const newServiceFee = {
      percentage: isNaN(percentage) ? (systemDefault.service_fee && systemDefault.service_fee.percentage || 0.00) : percentage,
      maxValue: isNaN(maxValue) ? (systemDefault.service_fee && systemDefault.service_fee.maxValue || 0.00) : maxValue,
    };
    systemDefault.set('service_fee', newServiceFee);
    await systemDefault.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_SERVICE_FEE',
      `Updated service fees: percentage=${newServiceFee.percentage}, maxValue=${newServiceFee.maxValue}`
    );

    res.status(200).json({ message: "service fees updated" });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.get('/service_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) return res.status(400).json({ message: "No service fees" });
    res.json({ fees: systemDefault.service_fee });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.patch('/airfreight_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) {
      const sysDef = new SystemDefault({ delivery_fee: { air_freight: req.body.amount } });
      await sysDef.save();
      return res.status(200).json({ message: "service fees updated" });
    }
    systemDefault.delivery_fee.air_freight = req.body.amount;
    await systemDefault.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_AIRFREIGHT_FEE',
      `Updated airfreight fee to ${req.body.amount}`
    );

    res.status(200).json({ message: "service fees updated" });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.get('/airfreight_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) return res.status(400).json({ message: "No service fees" });
    res.json({ fees: systemDefault.delivery_fee.air_freight });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.patch('/seafreight_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) {
      const sysDef = new SystemDefault({ delivery_fee: { sea_freight: req.body.amount } });
      await sysDef.save();
      return res.status(200).json({ message: "service fees updated" });
    }
    systemDefault.delivery_fee.sea_freight = req.body.amount;
    await systemDefault.save();

    // Log activity
    await logAdminActivity(
      req.user.id || req.user.data,
      'UPDATE_SEAFREIGHT_FEE',
      `Updated seafreight fee to ${req.body.amount}`
    );

    res.status(200).json({ message: "service fees updated" });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.get('/seafreight_fee', authenticate, async (req, res) => {
  try {
    const systemDefault = await SystemDefault.findOne({});
    if (!systemDefault) return res.status(400).json({ message: "No service fees" });
    res.json({ fees: systemDefault.delivery_fee.sea_freight });
  } catch (error) {
    res.status(400).json({ message: error });
  }
});

router.get('/auth/verify', authenticateAdmin, async (req, res) => {
  try {
    const user = await Admin.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Currency converter helper
 */
async function convertCurrency(amount, fromCurrency, toCurrency) {
  try {
    const response = await axios.get(`${CC_BASE_URL}/${CC_API_KEY}/latest/${fromCurrency}`);
    const rates = response.data.conversion_rates;
    if (rates[toCurrency]) {
      const conversionRate = rates[toCurrency];
      const convertedAmount = amount * conversionRate;
      return parseFloat(convertedAmount.toFixed(2));
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

const formatDateTime = (date) => {
  let d;
  if (!date || isNaN(Date.parse(date))) {
    d = new Date();
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

export default router;
