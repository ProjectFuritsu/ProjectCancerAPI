require("dotenv").config();
const exp = require("express");

const app = exp();

// Routers  
const router = exp.Router();
const financial_router = require('./routes/financial.route')
const health_insti_router = require('./routes/hospitals.route');
const auth_router = require('./routes/auth.route');


app.use(exp.json());


/*
  Basic Route
  - Returns API information

  * STATUS:
    200 - OK
  * Request Sample:
    GET /
  * The response contains basic information about the API.
*/
router.get("/", (req, res) => {
  res.json({
    name: "Welcome to Project Cancer API",
    status: "success",
    version: "v1.0",
    message: "This is a simple REST API service for Project Cancer.",
  });
});

// Mounting of routers
app.use("/v1", router);
app.use("/v1/healthinsti",health_insti_router);
app.use("/v1/financial",financial_router);
app.use("/v1/auth",auth_router)

// Then handle undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `The route ${req.originalUrl} does not exist`,
  });
});

// Start the server
app.listen(process.env.PORT, () => {
  console.log(`✅ Server is running on port ${process.env.PORT}`);
  console.log(`🌍 Base URL: http://localhost:${process.env.PORT}/v1`);
});
