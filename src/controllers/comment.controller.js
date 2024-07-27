import mongoose from "mongoose"
import { Comment } from "../models/comment.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"
import { Like } from "../models/like.model.js"

const getVideoComments = asyncHandler(async (req, res) => {
    //TODO: get all comments for a video
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "video not found");
    }
    const commentAggregate = Comment.aggregate([
        {
            $match: { video: new mongoose.Types.ObjectId(videoId) }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "comment",
                as: "likes"
            }
        },
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                owner: { first: "$owner" },
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
            $sort: { createdAt: -1 }
        },
        {
            $project: {
                content: 1,
                createdAt: 1,
                likesCount: 1,
                owner: {
                    username: 1,
                    fullname: 1,
                    "avatar.url": 1
                },
                isLiked: 1
            }
        }
    ]);
    const option = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };
    const comments = await Comment.aggregatePaginate(commentAggregate, option);
    res.status(200).json(new ApiResponse(200, comments, "comments fetched"));
});
const addComment = asyncHandler(async (req, res) => {
    // TODO: add a comment to a video
    const { videoId } = req.params;
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "video not found");
    }
    const content = req.body.content;
    if (!content) {
        throw new ApiError(404, "please enter something");
    }
    const comment = await Comment.create({
        content,
        video: videoId,
        owner: req.user?._id
    });
    if (!comment) {
        throw new ApiError(500, "comment not added");
    }
    res.status(201).json(new ApiResponse(201, comment, "comment created"))
});
const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    const { commentId } = req.params;
    const content = req.body.content;
    if (!content) {
        throw new ApiError(404, "please enter something");
    }
    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "comment not found");
    }
    const updatedComment = await Comment.findByIdAndUpdate(comment?.id, {
        $set: {
            content
        }
    }, { new: true });
    if (!updateComment) {
        throw new ApiError(404, "comment is not updated");
    }
    res.status(200).json(new ApiResponse(200, updatedComment, "comment updated"))
});
const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
    const { commentId } = req.params;
    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "comment not found");
    }
    await Comment.findByIdAndDelete(commentId);
    await Like.deleteMany({
        comment: commentId,
        likedBy: req.user
    });
    return res.status(200).json(new ApiResponse(200, { commentId }, "Comment deleted successfully"));

});
export {
    getVideoComments,
    addComment,
    updateComment,
    deleteComment
}
