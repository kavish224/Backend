import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating refresh and access tokens")
    }
};
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
    // const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverimage[0]?.path;

    // check for avatar
    // if (!avatarLocalPath) {
    //     throw new ApiError(400, "Avatar is required");
    // }
    // // upload them to cloudinary, avatar
    // const avatar = await uploadOnCloudinary(avatarLocalPath);
    // const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    // if (!avatar) {
    //     throw new ApiError(400, "Avatar is required");
    // }
    // create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: "",
        coverImage:  "",
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

});
const loginUser = asyncHandler(async (req, res) => {
    // req body -> data
    const { email, username, password } = req.body;
    // username or email
    if (!(username || email)) {
        throw new ApiError(400, "username or email is required");
    }
    // find user
    const user = await User.findOne({
        $or: [{ username }, { email }]
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
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)
    // send cookies(tokens)
    const loggedInUser = await User.findById(user._id).select("-password -refreshtoken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully"));
});
const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } }, { new: true })
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(new ApiResponse(200, "user logged out"));
    //access token is short lived as compared to refresh token access token is with user and refresh
    //token is also with database if access token is timed out refresh token is used to rrestart the session

});
const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if (!incomingRefreshToken) {
            throw new ApiError(401, "unauthorized request");
        }
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "unauthorized request");
        }
        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "refresh token is expired or used");
        }
        const options = {
            httpOnly: true,
            secure: true
        }
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id)

        return res.status(200).cookie("accessToken", accessToken).cookie("refreshToken", newRefreshToken).json(
            new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access token refreshed")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
});
const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    // if (!(newPassword === confPassword)) {
    //     throw new ApiError()
    // }
    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid Password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));

});
const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, req.user, "current user fetched Successfully"));
});
const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }
    const user = await User.findByIdAndUpdate(req.user?._id, { $set: { fullname: fullName, email } }, { new: true }).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"))
});
const userAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "avatar file missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "error while uploading on avatar");
    }
    const oldAvatar = req.user.avatar;
    const urlparts = oldAvatar.split('/').pop().split('.')[0];
    const user = await User.findByIdAndUpdate(
        req.user?._id, {
        $set: { avatar: avatar.url }
    }, { new: true }
    ).select("-password")
    // delete old avatar from cloudinary
    const removeOld = await deleteFromCloudinary(urlparts);
    res.status(200).json(new ApiResponse(200, user, "Avatar updated"))
});
const userCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "coverImage file missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "error while uploading on coverImage");
    }
    const oldCoverImg = req.user.coverImage;
    const urlparts = oldCoverImg.split('/').pop().split('.')[0]
    const user = await User.findByIdAndUpdate(
        req.user?._id, {
        $set: { coverImage: coverImage.url }
    }, { new: true }
    ).select("-password")
    // delete old cover image from cloudinary
    const removeOld = await deleteFromCloudinary(urlparts);
    res.status(200).json(new ApiResponse(200, user, "coverImage updated"))
});
const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params
    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }
    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ]);
    if (!channel?.length) {
        throw new ApiError(404, "channel does not exist")
    }
    return res.status(200).json(new ApiResponse(200, channel[0], "user channel fetched successfully"))
});
const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([

        {
            $match: {
                // code under aggregation pipelines directly goes to mongo not through mongoose
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, user[0].watchHistory, "user watch history fetched successfully"))
});
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    userAvatar,
    userCoverImage,
    getUserChannelProfile,
    getWatchHistory
}