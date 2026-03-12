import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    recipient: { type: String, required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected'], 
        default: 'pending' 
    },
    createdAt: { type: Date, default: Date.now }
});

const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;
