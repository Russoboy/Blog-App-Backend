const express = require("express");
const { signupFunction, loginFunction, logoutFunction} = require("../controllers/client-controllers/authControllers");
const { createClientsComplaints, getClientComplaints } = require("../controllers/client-controllers/commentControllers");
const { editComment, deleteOwnComment } = require('../controllers/client-controllers/commentControllers'); // or clientCommentController if you name it that

const studentAuth = require("../middlewares/studentAuth");

const router = express.Router();

router.post("/signup", signupFunction);
router.post("/login", loginFunction);
 router.post("/logout", logoutFunction)

router.use(studentAuth)
router.get('/create-clients-complaints', createClientsComplaints);
router.get('/client-complaints', getClientComplaints);
router.put('/comments/:id', studentAuth, editComment);
router.delete('/comments/:id', studentAuth, deleteOwnComment);


module.exports = router;