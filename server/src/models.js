import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, required: true },
    email: String,
    name: String,
    picture: String,
    refCode: { type: String, unique: true, sparse: true }, // goes in this user's invite links
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referrals: { type: Number, default: 0 },
    vipUntil: Date, // earned by referring a new user
  },
  { timestamps: true }
);

const usageSchema = new mongoose.Schema({
  key: { type: String, required: true }, // "u:<userId>" | "g:<guestId>" | "ip:<addr>"
  day: { type: String, required: true }, // UTC YYYY-MM-DD
  count: { type: Number, default: 0 },
});
usageSchema.index({ key: 1, day: 1 }, { unique: true });
// Old counters are useless after a day or two; let Mongo clean them up.
usageSchema.add({ createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 48 } });

// A private invite link. It stays valid for 24 hours: whoever opens it waits for the other.
const inviteSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  owner: { type: String, required: true, index: true }, // person key: user id or guest id
  ownerName: String,
  ownerPicture: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export const User = mongoose.model('User', userSchema);
export const Invite = mongoose.model('Invite', inviteSchema);
export const Usage = mongoose.model('Usage', usageSchema);
