const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SIGNATURE_TIME_LIMIT, ROOM_TYPE_PRICES } = require('../constants');
const { handleApplicationError } = require('../errors');
const { utils } = require('web3');

const Booking = new Schema({
  bookingHash: {
    type: String,
    required: [true, 'noBookingHash'],
  },
  guestEthAddress: {
    type: String,
    required: [true, 'noGuestEthAddress'],
  },
  roomType: {
    type: String,
    enum: ['double', 'twin'],
    required: [true, 'noRoomType'],
  },
  from: {
    type: Number,
    validate: {
      validator: function (from) {
        return from > 0 && from < 5;
      },
      message: 'fromOutOfRange',
    },
    required: [true, 'noFrom'],
  },
  to: {
    type: Number,
    validate: {
      validator: function (to) {
        return to >= this.from && to < 5;
      },
      message: 'toOutOfRange',
    },
    required: [true, 'noTo'],
  },
  paymentAmount: {
    type: Number,
    validate: {
      validator: function (amount) {
        return amount > 0;
      },
      message: 'minAmount',
    },
    required: [true, 'noPaymentAmount'],
  },
  paymentType: {
    type: String,
    enum: ['eth', 'lif'],
    required: [true, 'noPaymentType'],
  },
  paymentTx: {
    type: String,
  },
  signatureTimestamp: {
    type: Number,
    default: function () {
      return Date.now() / 1000 - SIGNATURE_TIME_LIMIT * 60;
    },
    required: [true, 'noSignatureTimestamp'],
  },
  encryptedPersonalInfo: {
    type: String,
    required: [true, 'noEncryptedPersonalInfo'],
  },
});

Booking.method({
  encryptPersonalInfo: function (personalInfo) {
    if (typeof personalInfo !== 'object') {
      throw handleApplicationError('invalidPersonalInfo');
    }
    personalInfo = JSON.stringify(personalInfo);
    this.encryptedPersonalInfo = utils.stringToHex(personalInfo);
  },
  decryptPersonalInfo: function () {
    if (!utils.isHex(this.encryptedPersonalInfo)) {
      throw handleApplicationError('invalidEncryptedPersonalInfo');
    }
    let decoded = utils.hexToString(this.encryptedPersonalInfo);
    return JSON.parse(decoded);
  },
  generateBookingHash: function () {
    const randomCode = Math.floor((1 + Math.random()) * 10000);
    this.bookingHash = utils.sha3(`${randomCode}${Date.now()}`);
  },
  generatePaymentAmount: function (ethPrice) {
    if (typeof ethPrice !== 'number') {
      throw handleApplicationError('invalidEthPrice');
    }
    this.paymentAmount = (ROOM_TYPE_PRICES[this.roomType] * (1 + this.to - this.from) / ethPrice) + 0.00001;
  },
  getWeiPerNight: function (ethPrice) {
    if (typeof ethPrice !== 'number') {
      throw handleApplicationError('invalidEthPrice');
    }
    return utils.toWei((ROOM_TYPE_PRICES[this.roomType] / ethPrice).toString(), 'ether');
  },
});

// Error Handler
Booking.post('save', function (error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    return handleApplicationError('duplicateBooking');
  }
  if (!error.errors) {
    return next(error);
  }
  
  const firstKeyError = Object.keys(error.errors)[0];
  const firstError = error.errors[firstKeyError];
  switch (firstError.name) {
  case 'CastError':
    return next(handleApplicationError(`invalid${firstError.path[0].toUpperCase()}${firstError.path.substring(1)}`));
  default:
    throw handleApplicationError(firstError.message);
  }
});

Booking.statics.generate = function (data) {
  const { personalInfo, ethPrice, ...rest } = data;
  const BookingModel = this.model('Booking');
  const booking = new BookingModel(rest);
  booking.encryptPersonalInfo(personalInfo);
  booking.generateBookingHash();
  booking.generatePaymentAmount(ethPrice);
  return booking;
};

module.exports = { Booking: mongoose.model('Booking', Booking) };
