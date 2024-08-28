const asyncHandler = (requestHandler) => (req, res, next) =>{
    Promise.resolve(requestHandler(req, res, next)).catch((err)=>{
        next(err)
    })
}

export default asyncHandler


// const asyncHandler = (func) => async ()=>{
//     try{
//         await func(req, res, next)
//     }
//     catch(err){
//         console.log("Error : ", err);
//     }
// }