import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
    blocker: String, // Usuario que bloquea
    blocked: String, // Usuario bloqueado
});

const Block = mongoose.model('Block', blockSchema);
export default Block;
