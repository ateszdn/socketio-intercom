const printMyDate = () => {
    return new Date(Date.now()).toLocaleString('hu-HU', { timeZone: 'CET'});
};
module.exports = printMyDate;
