var patreon = require("patreon");
var patreonAPI = patreon.patreon;
const patreonInfo = require("../patreonsecret.js");
const accessToken = patreonInfo.AccessToken;
const campID = "4942396";

const patreonAPIClient = patreonAPI(accessToken);

exports.patreon = (req, res, next) => {
  patreonAPIClient(`/campaigns/${campID}/pledges`)
    .then((result) => {
      res.send(result.rawJson);
    })
    .catch((err) => {
      console.error("error!", err);
      response.end(err);
    });
};
