import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

//generate access and refresh token
const generateAccessAndRefereshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
    }
}


//registerUser
const registerUser = asyncHandler(async (req,res)=>{
    
    // get user details from frontend
    //validation - not empty
    //check if user already exists: username,email
    //check for images,check for avatar
    //upload them to cloudinary,avatar
    //create user object - create entry in db
    //remove password and refresh token field from response
    //check for user creation
    //return response
     
    
    // get user details from frontend
    const {fullname,email,username,password}=req.body
    
    //console.log("email: ",email);
   
   //validation - not empty
    if ([fullname,email,username,password].some((field)=>field?.trim()==="")) {
    throw new ApiError(400,"All fields are required")
   }


   //check if user already exists: username,email
   const existedUser = await User.findOne({
    $or: [{ username },{ email }]
   })

   if (existedUser) {
    throw new ApiError(409, "User with username or email exists")
   }
   //images and files
   //const avatarLocalPath = req.files?.avatar[0]?.path;
   //const coverImageLocalPath = req.files?.coverImage[0]?.path;


   let avatarLocalPath;
   if(req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0){
    avatarLocalPath = req.files.avatar[0].path
   }


   let coverImageLocalPath;
   if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
    coverImageLocalPath = req.files.coverImage[0].path
   }
   
   //check for images,check for avatar
   if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is required")
   }


    //upload them to cloudinary,avatar
   const avatar = await uploadOnCloudinary(avatarLocalPath)

   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if (!avatar) {
    throw new ApiError(400,"Avatar file is required")
   }

   //create user object - create entry in db
   const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase()
   })


   //remove password and refresh token field from response
   const createdUser = await User.findById(user._id).select('-password -refreshToken')



    //check for user creation
    if (!createdUser) {
        throw new ApiError(500,"Something went wrong while registering the user")
    }



    //return response
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )
})


//login User
const loginUser = asyncHandler(async (req,res)=>{
    //req body ->data
    //username or email
    //find the user
    //password check
    //access and refresh token
    //send cookie


    //req body ->data
    const {email,username,password} = req.body
    
    
    //username or email
    if(!(username || email)){
        throw new ApiError(400, "username or email is required")
    }


    //find the user
    const user = await User.findOne({
        $or: [{email},{username}]
    })

    if(!user){
        throw new ApiError(404,"User does not exists")
    }


    //password check
    const isPasswordVaild = await user.isPasswordCorrect(password)
    
    if(!isPasswordVaild){
        throw new ApiError(401,"Invalid User credentials")
    }



    //access and refresh token
    const {accessToken,refreshToken} = await generateAccessAndRefereshTokens(user._id)


    //send cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).json(
        new ApiResponse(200,{
            user: loggedInUser,accessToken,refreshToken
        },"User logged in successfully")
    )
})


// logout User
const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,{
            $set: {
                refreshToken: undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"User LoggedOut"))
})


//refresh Access token
const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401,"Unauthorized request")
    }


try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
       const user =  await User.findById(decodedToken?._id)
    
       if (!user) {
        throw new ApiError(401,"Invalid Refresh Token")}
       
        if (incomingRefreshToken!==user?.refreshToken) {
        throw new ApiError(401,"Refresh token is expired or use")
       }
    
       const options = {
        httpOnly:true,
        secure:true
       }
    
       const {accessToken,newrefreshToken}=await generateAccessAndRefereshTokens(user._id)
    
       return res.status(200).cookie("accessTokes",accessToken,options).cookie("refreshToken",newrefreshToken,options).json(
        new ApiResponse(200,{
            accessToken,newrefreshToken
        },"Access token refreshed successfully")
       )
} catch (error) {
    throw new ApiError(401,error?.message || "Invalid refresh token")
}

})
// change password
const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"Invalid old password")
    }

    user.password = newPassword
    await user.save(validateBeforeSave)

    return res.status(200).json(new ApiResponse(200,{

    },"password changed successfully"))
})

//get user
const getCurrentUser = asyncHandler(async (req,res) =>{
    return res.status(200).json(new ApiResponse(200,req.user,"current user fetched successfully"))
})

//update details
const updateAccountDetails = asyncHandler(async(req,res)=>{
    const{fullname,email} = req.body

    if (!fullname || !email) {
         throw new ApiError(400,"All fields are required")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                fullname,
                email:email,
            }
        },{
            new:true
        }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"))
})

//update Avatar
const updateUserAvatar = asyncHandler(async(req,res)=> {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400,"Avatar file is missing")
    }

   const avatar = await uploadOnCloudinary(avatarLocalPath)

   if(!avatar.url){
    throw new ApiError(400,"Error while Uploading avatar")
   }

   const user = await User.findByIdAndUpdate(req.user?._id ,{
    $set:{
        avatar:avatar.url
    }
   },{new:true}.select("-password"))
   
   return res.status(200).json(new ApiResponse(200,user,"Avatar Image updated successfully"))
})

//update coverImage
const updateUserCoverImage = asyncHandler(async(req,res)=> {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400,"Cover Image file is missing")
    }

   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if(!coverImage.url){
    throw new ApiError(400,"Error while Uploading cover Image")
   }

   const user = await User.findByIdAndUpdate(req.user?._id ,{
    $set:{
        coverImage:coverImage.url
    }
   },{new:true}.select("-password"))
   return res.status(200).json(new ApiResponse(200,user,"cover Image updated successfully"))
})


const getUserChannelProfile = asyncHandler(async(req,res)=> {
    const {username} = req.parmas

    if (!username?.trim()) {
        throw new ApiError(400,"username is missing")
    }

    const channel = await User.aggregate([{
        $match: {
            username: username?.toLowerCase()
        }
    },{
        $lookup:{
            from: "subscriptions",
            localField:"_id",
            foreignField:"channel",
            as:"subscribers"
        }
    },{
        $lookup:{
            from: "subscriptions",
            localField:"_id",
            foreignField:"subscriber",
            as:"subscribedTo"
        }
    },{
        $addFields:{
            subscribersCount:{
                $size:"$subscribers"
            },
            channelsSubscribedToCount:{
                $size:"$subscribedTo"
            },
            isSubscribed:{
                $cond:{
                    if:{$in: [req.user?._id,"$subscribers.subscriber"]},
                    then: true,
                    else: false
                }
            }
        }
    },{
        $project:{
            fullname: 1,
            username: 1,
            subscribersCount: 1,
            channelsSubscribedToCount: 1,
            isSubscribed: 1,
            avatar: 1,
            email: 1,
            coverImage:1
        }
    }
])

if (!channel?.length) {
    throw new ApiError(404, "channel does not exists")
}

return res.status(200).json(
    new ApiResponse(200,channel[0],"User channel fetched successfully")
)
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([{
        $match:{
            _id:new mongoose.Types.ObjectId(req.user._id),
        }
    },
    {
        $lookup:{
            from: "videos",
            localField:"watchHistory",
            foreignField:"_id",
            as:"watchHistory",
            pipeline:[
                {
                $lookup:{
            from: "users",
            localField:"owner",
            foreignField:"_id",
            as:"owner",
            pipeline:[{
                $project:{
                    fullname:1,
                    username:1,
                    avatar:1
                }
            }]
                }
            },{
                $addFields:{
                    owner:{
                        $first:"$owner"
                    }
                }
            }
        ]
      }
    }
  ])


  return res.status(200).json(new ApiResponse(200,user[0].WatchHistory,"watched history fetched"))
})

export {registerUser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,getCurrentUser,updateAccountDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getWatchHistory}