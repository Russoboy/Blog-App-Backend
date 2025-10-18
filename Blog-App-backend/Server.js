require('dotenv').config();
const express = require("express");
const cors = require("cors")
const app = express();

const adminRoutes = require("./routes/adminRoutes")
const clientRoutes = require("./routes/clientRoutes")
// const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const commentRoutes = require("./routes/commentRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const webhookRoutes = require("./routes/webhookRoutes");


const PORT  = process.env.PORT || 5000;

app.use(cors("https://www.reddit.com/"));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URL).then(() => {
    console.log('DB CONNECTED!')
    app.listen(PORT, () => {
        console.log(`SERVER LISTENING ON PORT ${PORT}`)
    });
}).catch((error) => {
    console.log("Error connecting to DB:", error);
})



app.use("/admin", adminRoutes);
app.use("/client", clientRoutes); 
app.use("/auth", authRoutes);
app.use("/post", postRoutes);
app.use("/comment", commentRoutes);
app.use("/media", mediaRoutes);
app.use("/webhook", webhookRoutes);
//routes
