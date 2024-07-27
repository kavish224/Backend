import mongoose, { isValidObjectId } from "mongoose"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"

const createPlaylist = asyncHandler(async (req, res) => {
    const { name, description } = req.body
    //TODO: create playlist
    if ([name, description].some((fields) => fields.trim() === "")) {
        throw new ApiError(400, "name and description required");
    }
    const newPlaylist = await Playlist.create({
        name,
        description,
        owner: req.user?._id
    });
    if (!newPlaylist) {
        throw new ApiError(400, "unable to please try again");
    }
    res.status(200).json(new ApiResponse(200, newPlaylist, "playlist created"));
});
const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params
    //TODO: get user playlists
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "invalid user id")
    }
    const playlists = await Playlist.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $addFields: {
                totalVideos: {
                    $size: "$videos"
                },
                totalViews: {
                    $sum: "$videos.views"
                }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                description: 1,
                totalVideos: 1,
                totalViews: 1,
                updatedAt: 1
            }
        }
    ]);
    return res
        .status(200)
        .json(new ApiResponse(200, playlists, "User playlists fetched successfully"));
});
const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    //TODO: get playlist by id
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "invalid playlist id");
    }
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(400, "unable to find playlist");
    }
    const playlistVideos = await Playlist.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(playlistId)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos",
            }
        },
        {
            $match: {
                "videos.isPublished": true
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            }
        },
        {
            $addFields: {
                totalVideos: {
                    $size: "$videos"
                },
                totalViews: {
                    $sum: "$videos.views"
                },
                owner: {
                    $first: "$owner"
                }
            }
        },
        {
            $project: {
                name: 1,
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                totalVideos: 1,
                totalViews: 1,
                videos: {
                    _id: 1,
                    "videoFile.url": 1,
                    "thumbnail.url": 1,
                    title: 1,
                    description: 1,
                    duration: 1,
                    createdAt: 1,
                    views: 1
                },
                owner: {
                    username: 1,
                    fullName: 1,
                    "avatar.url": 1
                }
            }
        }

    ]);
    res.status(200).json(new ApiResponse(200, playlistVideos, "playlist found"))
})
const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "invalid playlist id");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const playlist = await Playlist.findById(playlistId);
    const video = await Video.findById(videoId);
    if (!playlist) {
        throw new ApiError(400, "playlist not found");
    }
    if (!video) {
        throw new ApiError(400, "video not found");
    }
    if (playlist.owner?.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "only owner can add video to thier playlist");
    }
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlist?._id,
        {
            $addToSet: {
                videos: videoId,
            },
        },
        { new: true }
    );
    if (!updatedPlaylist) {
        throw new ApiError(400, "failed to add video to playlist please try again");
    }
    return res.status(200).json(new ApiResponse(200, updatedPlaylist, "Added video to playlist successfully"));
});
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params
    // TODO: remove video from playlist
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "invalid playlist id");
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id");
    }
    const playlist = await Playlist.findById(playlistId);
    const video = await Video.findById(videoId);
    if (!playlist) {
        throw new ApiError(400, "playlist not found");
    }
    if (!video) {
        throw new ApiError(400, "video not found");
    }
    if (playlist.owner?.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "only owner can remove video to thier playlist");
    }
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlist?._id,
        {
            $pull: {
                videos: videoId,
            },
        },
        { new: true }
    );
    if (!updatedPlaylist) {
        throw new ApiError(400, "failed to remove video from playlist please try again");
    }
    return res.status(200).json(new ApiResponse(200, updatedPlaylist, "removed video from playlist successfully"));
});
const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    // TODO: delete playlist
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "invalid playlist id");
    }
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(400, "playlist not found");
    }
    if (playlist.owner?.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "only owner can delete thier playlist");
    }
    const deleted = await Playlist.findByIdAndDelete(playlistId);
    if (!deleted) {
        throw new ApiError(400, "unable to delete try again");
    }
    res.status(200).json(new ApiResponse(200, deleted, "playlist deleted"));
});
const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    const { name, description } = req.body
    //TODO: update playlist
    if (!name || !description) {
        throw new ApiError(400, "name and description both are required");
    }

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid PlaylistId");
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "only owner can edit the playlist");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlist?._id,
        {
            $set: {
                name,
                description,
            },
        },
        { new: true }
    );
    return res.status(200).json(new ApiResponse(200, updatedPlaylist, "playlist updated successfully"));
});
export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    updatePlaylist,
    deletePlaylist
}
