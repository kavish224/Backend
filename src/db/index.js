import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async()=>{
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log(`\n mongo connected db host: ${connectionInstance.connection.host}`);
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
                app.on("error",(error)=>{
                    console.log("failed to talk");
                    throw error;
                })
    } catch (error) {
        console.log("mongo error: ",error);
        process.exit(1);
    }
}

export default connectDB