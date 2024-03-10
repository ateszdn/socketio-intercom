const printMyDate = () => {
    //myDate = new Date(Date.now()).toLocaleString('hu-HU', { timeZone: 'CET', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'});
    myDate = new Date(Date.now()).toLocaleString('hu-HU', { timeZone: 'CET'});
    return myDate;
}
module.exports = printMyDate;
