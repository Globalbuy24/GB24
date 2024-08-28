const jwt = require('jsonwebtoken');

/**
 * 
 * @param {*} req - request ,from user
 * @param {*} res - responds, back to user
 * @param {*} next - sent to function 
 * @returns errors, if the token is not valid , or if the token expires
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
   
  if (!authHeader) {
    return res.sendStatus(401);
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log(err);
      return res.sendStatus(403);
    }

    req.user = user;
    next();
  });
}

module.exports = authenticateToken;