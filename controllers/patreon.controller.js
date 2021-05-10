var patreon = require("patreon");
var patreonAPI = patreon.patreon;
const patreonInfo = require("../patreonsecret.js");
const accessToken = patreonInfo.AccessToken;
const campID = "4942396";

const patreonAPIClient = patreonAPI(accessToken);
function checkUser(item) {
  return item.type == "user" && item.attributes.full_name != "Colin Buffum";
}

exports.patreon = (req, res, next) => {
  patreonAPIClient(`/campaigns/${campID}/pledges`)
    .then((result) => {
      let theIncluded = result.rawJson.included;
      let weeded = (theIncluded || []).filter(checkUser);
      let cleanArray = [];
      weeded.map((v) => {
        cleanArray.push({ name: v.attributes.full_name, id: v.id });
      });
      res.send(cleanArray);
    })
    .catch((err) => {
      console.error("error!", err);
      response.end(err);
    });
};
