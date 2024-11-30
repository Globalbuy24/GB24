
const axios = require('axios');
// const baseUrl = 'https://live.fapshi.com'
const baseUrl = 'https://sandbox.fapshi.com'
const headers =  {
    apiuser: '8fc80ee5-c56a-4d40-b7ee-d844ca1f4fcf',
    apikey: 'FAK_TEST_2986a7849907d6c149d6'
}

module.exports = {
    /** 
    *This function returns an object with the link were a user is to be redirected in order to complete his payment

    *Below is a parameter template. Just amount is required

        data = {
            "amount": Integer ,
            "email": String,
            "userId": String,
            "externalId": String,
            "redirectUrl": String,
            "message": String
        }
    */
    initiatePay(data){
        return new Promise(async function(resolve){
            try {

                if(!data?.amount)
                    resolve(error('amount required', 400))
                if(!Number.isInteger(data.amount))
                    resolve(error('amount must be of type integer', 400))
                if(data.amount<100)
                    resolve(error('amount cannot be less than 100 XAF', 400))

                const config = {
                    method: 'post',
                    url: baseUrl+'/initiate-pay',
                    headers: headers,
                    data: data
                }
                const response = await axios(config)
                response.data.statusCode = response.status
                resolve(response.data)
            }catch(e){
                e.response.data.statusCode = e?.response?.status
                resolve(e.response.data)
            }
        })
    },
    
    paymentStatus(transId){
        return new Promise(async function(resolve){
            try {
                if(!transId || typeof transId !== 'string')
                    resolve(error('invalid type, string expected', 400))
                if(!/^[a-zA-Z0-9]{8,10}$/.test(transId))
                    resolve(error('invalid transaction id', 400))

                const config = {
                    method: 'get',
                    url: baseUrl+'/payment-status/'+transId,
                    headers: headers
                }
                const response = await axios(config)
                response.data.statusCode = response.status
                resolve(response.data)
            }catch(e){
                e.response.data.statusCode = e?.response?.status
                resolve(e.response.data)
            }
        })
    },


}

function error(message, statusCode){
    return {message, statusCode}
}