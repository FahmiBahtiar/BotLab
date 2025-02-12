import app from './index.js';
// import dotenv from "dotenv"

//Handling Uncaught Exception
process.on("uncaughtException",(err)=>{
    console.log(`Error: ${err.message}`);
    console.log(`Shutting Down the server due to Unchaugt rejection`);
    process.exit(1) 
})

const server = app.listen(process.env.PORT,()=>{

    console.log(`Server Is Running On http://localhost:${process.env.PORT}`)
});



// Unhandle Promise Rejection
process.on("unhandledRejection",err => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting Down the server due to unhandle rejection`);

    server.close(() => {
        process.exit(1);
    })
})