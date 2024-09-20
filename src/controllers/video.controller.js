import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { Comment } from "../models/comment.model.js"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
    const pipeline = [];
    // for using Full Text based search u need to create a search index in mongoDB atlas
    // you can include field mapppings in search index eg.title, description, as well
    // Field mappings specify which fields within your documents should be indexed for text search.
    // this helps in seraching only in title, desc providing faster search results
    // here the name of search index is 'search-videos'
    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"] //search only on title, desc
                }
            }
        });
    }
    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }
        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        });
    }
    // fetch videos only that are set isPublished as true
    pipeline.push({ $match: { isPublished: true } });
    //sortBy can be views, createdAt, duration
    //sortType can be ascending(-1) or descending(1)
    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }
    )
    const videoAggregate = Video.aggregate(pipeline);
    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };
    const video = await Video.aggregatePaginate(videoAggregate, options);
    return res.status(200).json(new ApiResponse(200, video, "Videos fetched successfully"));
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
    //add verification step filetype video for videofile,image for thumbnail
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
        owner: req.user?._id,
        isPublished: false
    });
    const videoUploaded = await Video.findById(publishedVideo._id);
    if (!videoUploaded) {
        throw new ApiError(500, "videoUpload failed please try again");
    }
    return res.status(200).json(new ApiResponse(200, publishedVideo, "video published"));
});
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.body;
    //TODO: get video by id
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscribers"
                        }
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscribers"
                            },
                            isSubscribed: {
                                $cond: {
                                    if: {
                                        $in: [
                                            req.user?._id,
                                            "$subscribers.subscribers"
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                            subscribersCount: 1,
                            isSubscribed: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: "$likes"
                },
                owner: {
                    $first: "$owner"
                },
                isLiked: {
                    $cond: {
                        if: { $in: [req.user?._id, "$likes.likedBy"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                "videoFile.url": 1,
                title: 1,
                description: 1,
                views: 1,
                createdAt: 1,
                duration: 1,
                comments: 1,
                owner: 1,
                likesCount: 1,
                isLiked: 1
            }
        }
    ]);
    if (!video) {
        throw new ApiError(500, "failed to fetch video");
    }
    // increment views if video fetched successfully
    await Video.findByIdAndUpdate(videoId, {
        $inc: {
            views: 1
        }
    });
    // add this video to user watch history
    await User.findByIdAndUpdate(req.user?._id, {
        $addToSet: {
            watchHistory: videoId
        }
    });
    return res.status(200).json(new ApiResponse(200, video, "video fetched"));
});
const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    //TODO: update video details like title, description, thumbnail
    const { title, description } = req.body;
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    if (!(title && description)) {
        throw new ApiError(400, "please enter title and description");
    }
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(400, "video not found");
    }
    if (req.user?._id.toString() !== video?.owner.toString()) {
        throw new ApiError(400, "Only user can delete video");
    }
    const localThumbnail = req.file?.path;
    if (!localThumbnail) {
        throw new ApiError(400, "thumbnail required");
    }
    const thumbId = video.thumbnail.split("/").pop().split(".")[0];
    const newThumbnail = await uploadOnCloudinary(localThumbnail);
    if (!newThumbnail) {
        throw new ApiError(400, "unable to upload thumbnail")
    }
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
        await deleteFromCloudinary(usrThumbId);
        await deleteFromCloudinary(usrVideoId, "video");
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
