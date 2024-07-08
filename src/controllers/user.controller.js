import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
const registerUser = asyncHandler( async (req, res) => {
    // get user details
    const {fullname, email, username, password} =req.body;
    console.log("email ",email);
    console.log("username ",username);
    // validation -not empty
    // if (fullname == "") {
    //     throw new ApiError(400, "fullname is required");
    // }
    if ([fullname, email, username, password].some((field)=>field?.trim()==="")){
        throw new ApiError(400, "All fields are required");
    }
    // check if user already exists: username, email
    const existedUser = User.findOne({$or: [{username}, {email}]});
    if (existedUser){
        throw new ApiError(409, "user with email or username already exists");

    }
    // check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    console.log(avatarLocalPath);
    const coverimageLocalPath = req.files?.coverimage[0]?.path;
    console.log(coverimageLocalPath);

    // check for avatar
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }
    // upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverimage = await uploadOnCloudinary(coverimageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar is required");
    }
    // create user object - create entry in db
    const user =  User.create({
        fullname,
        avatar: avatar.url,
        coverimage: coverimage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });
    // remove password and refresh token feild from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    console.log("user_id: ",createdUser);
    // check for user creation
    if (!createdUser) {
        throw new ApiError(500, "something went wrong while registering the user");
    }
    // return response
    return res.status(201).json(new ApiResponse(200,createdUser, "User registered successfully"));
    
})

export {registerUser,}