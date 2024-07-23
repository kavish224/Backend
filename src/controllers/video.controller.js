import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination

});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const { user } = req.user;
    // TODO: get video, upload to cloudinary, create video
    const currUser = await User.findOne(user);
    if (!currUser) {
        throw new ApiError(400, "invalid user");
    }
    if ([title, description].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "title and description required");
    }
    const localVideoFile = req.files?.videoFile[0]?.path;
    const localThumbnail = req.files?.thumbnail[0]?.path;
    if (!localVideoFile) {
        throw new ApiError(400, "video required");
    }
    if (!localThumbnail) {
        throw new ApiError(400, "thumbnail required");
    }
    const video = await uploadOnCloudinary(localVideoFile);
    const thumb = await uploadOnCloudinary(localThumbnail);
    if (!video) {
        throw new ApiError(400, "video not uploaded");
    }
    if (!thumb) {
        throw new ApiError(400, "thumbnail not uploaded");
    }
    const publishedVideo = await Video.create({
        videoFile: video.url,
        thumbnail: thumb.url,
        title,
        description,
        duration: video.duration,
        owner: req.user?._id
    });
    return res.status(200).json(new ApiResponse(200, publishedVideo, "video published"));
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    //TODO: get video by id
    const video = await Video.findById(videoId);
    return res.status(200).json(new ApiResponse(200, video, "video fetched"));
});

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    //TODO: update video details like title, description, thumbnail
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const video = await Video.findById(videoId);
    const { title, description } = req.body;
    if ([title, description].some((field) => field.trim() === "")) {
        throw new ApiError(400, "please enter title and description");
    }
    const localThumbnail = req.file?.path;
    if (!localThumbnail) {
        throw new ApiError(400, "thumbnail required");
    }
    const thumbnailToDelete = video.thumbnail;
    const thumbId = thumbnailToDelete.split("/").pop().split(".")[0];
    console.log(thumbId);
    const newThumbnail = await uploadOnCloudinary(localThumbnail);
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
                thumbnail: newThumbnail.url
            }
        },
        { new: true }
    );
    if (!updatedVideo) {
        await deleteFromCloudinary(newThumbnail.public_id);
        throw new ApiError(500, "failed to update, try again");
    }
    if (updatedVideo) {
        await deleteFromCloudinary(thumbId);
    }
    return res.status(200).json(new ApiResponse(200, updatedVideo, "video details updated"));
});

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    //TODO: delete video
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(400, "video not found");
    }
    if (req.user?._id.toString() !== video?.owner.toString()) {
        throw new ApiError(400, "Only user can delete video");
    }
    const usrVideoId = video.videoFile.split("/").pop().split(".")[0];
    const usrThumbId = video.thumbnail.split("/").pop().split(".")[0];
    const deleteVideo = await Video.findByIdAndDelete(videoId);
    if (!deleteVideo) {
        throw new ApiError(500, "video not deleted try again");
    }
    if (deleteVideo) {
        await deleteFromCloudinary(usrVideoId, "video");
        await deleteFromCloudinary(usrThumbId);
    }
     // delete video likes
     await Like.deleteMany({
        video: videoId
    })

     // delete video comments
    await Comment.deleteMany({
        video: videoId,
    })
    return res.status(200).json(new ApiResponse(200, deleteVideo, "video deleted"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(400, "video not found");
    }
    if (req.user?._id.toString() !== video?.owner.toString()) {
        throw new ApiError(400, "Only user can update publish status");
    }
    const updatePublishedStatus = await Video.findByIdAndUpdate(videoId,
        {
            $set: {
                isPublished: !video.isPublished
            }
        },
        { new: true }
    );
    if (!updatePublishedStatus) {
        throw new ApiError(400, "unable to update published status please try again");
    }
    return res.status(200).json(new ApiResponse(200, updatePublishedStatus, "published status updated"));
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
