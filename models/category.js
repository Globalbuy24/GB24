import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    subtypes: [{name:{type:String},image:{type:String}}], 
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

export default Category;
