import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    creator: { type: String, required: true },
    members: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

const Group = mongoose.model('Group', groupSchema);
export default Group;
