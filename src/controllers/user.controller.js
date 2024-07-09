import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
const generateAccessAndRefreshToken = async(userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating refresh and access tokens")
    }
}
const registerUser = asyncHandler(async (req, res) => {
    // get user details
    const { fullname, email, username, password } = req.body;
    // console.log("email ", email);
    // console.log("username ", username);
    // validation -not empty
    // if (fullname == "") {
    //     throw new ApiError(400, "fullname is required");
    // }
    if ([fullname, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }
    // check if user already exists: username, email
    const existedUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existedUser) {
        throw new ApiError(409, "user with email or username already exists");

    }
    // check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverimage[0]?.path;
    
    // check for avatar
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }
    // upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar is required");
    }
    // create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });
    // remove password and refresh token feild from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    // console.log("user_id: ", createdUser);
    // check for user creation
    if (!createdUser) {
        throw new ApiError(500, "something went wrong while registering the user");
    }
    // return response
    return res.status(201).json(new ApiResponse(200, createdUser, "User registered successfully"));

})

const loginUser = asyncHandler(async (req, res)=>{
    // req body -> data
    const {email, username, password} = req.body;
    // username or email
    if (!(username || email)) {
        throw new ApiError(400, "username or email is required");
    }
    // find user
    const user = await User.findOne({
        $or: [{username},{email}]
    })
    if (!user) {
        throw new ApiError(404, "user does not exists")
    }
    // password check
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Wrong password")
    }
    // access token and refresh token
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)
    // send cookies(tokens)
    const loggedInUser = await User.findById(user._id).select("-password -refreshtoken")

    const options = {
        httpOnly: true,
        secure: true
    }
    
    return res
    .status(200)
    .cookie("accessToken",accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json({
        status: 200,
        message: "User logged in successfully",
        data: {
            user: loggedInUser,
            accessToken: accessToken,
            refreshToken: refreshToken
        }
    })
})
const logoutUser = asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(req.user._id,{$set:{refreshToken: undefined}},{new: true})
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken",options).json(new ApiResponse(200, "user logged out"))
})
export { registerUser, loginUser, logoutUser }