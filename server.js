// server.js
// where your node app starts

// we've started you off with Express (https://expressjs.com/)
// but feel free to use whatever libraries or frameworks you'd like through `package.json`.
const express = require("express");
const basicAuth = require('basic-auth')
const axios = require("axios");
const { Op } = require("sequelize");
const app = express();

// init sqlite db
var fs = require("fs");
var dbFile = "./.data/sqlite.db";
var exists = fs.existsSync(dbFile);
var db = require("./models/index.js");

// make all the files in 'public' available
// https://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

app.use(function (request, response, next) {
  if (request.path != "/")
    return next();
  
  var user = basicAuth(request);
  console.log(user)
  if (!user || user.name !== process.env.HTTP_AUTH_USER || user.pass !== process.env.HTTP_AUTH_PASSWORD) {
    response.set('WWW-Authenticate', 'Basic realm="site"');
    return response.status(401).send();
  }
  return next();
});

// https://expressjs.com/en/starter/basic-routing.html
app.get("/", (request, response) => {
  response.sendFile(__dirname + "/views/index.html");
});

// send the default array of dreams to the webpage
app.get("/update_channels", async (request, response) => {
  // express helps us take JS objects and send them as JSON
  const channels = await getChannels();
  const parsed_channels = parseChannels(channels);
  const saved_channels = await save_channels(parsed_channels);
  response.type("text");
  response.send(String(saved_channels));
});

const save_channels = async channels => {
  const creation_token = String(Date.now())

  let saved_channels = 0
  for (const i in channels) {
    let {created} = await updateOrCreate(
      db.Channel,
      { url: channels[i][1] },
      { name: channels[i][0], url: channels[i][1], creation_token: creation_token }
    );
    saved_channels += created
  }
  console.log("After update")

  await db.Channel.destroy(
    {where: {
      [Op.or]: [
        { creation_token: {[Op.ne]: creation_token}},
        { creation_token: {[Op.is]: null}}
      ]
    }
  })
  console.log("After destroy channels")
  
  return saved_channels;
};

async function updateOrCreate(model, where, newItem) {
  
  // First try to find the record
  const foundItem = await model.findOne({ where });
  console.log("foundItem")
  if (!foundItem) {
    // Item not found, create a new one
    const item = await model.create(newItem);
    return { item, created: true };
  }
  // Found an item, update it
  const item = await model.update(newItem, { where });
  return { item, created: false };
}

const parseChannels = channels => {
  const channel_list = [];
  const sources_list = [];

  for (const line in channels) {
    const cline = channels[line];

    let matches = cline.match(/group\-title=".*",(.*)/);
    if (matches && matches.length > 1) {
      channel_list.push(matches[1]);
    }

    matches = cline.match(/^(http.*m3u8)/);
    if (matches && matches.length > 1) {
      sources_list.push(matches[1]);
    }
  }

  return channel_list.map(function(e, i) {
    return [e, sources_list[i]];
  });
};

const getChannels = async () => {
  const response = await axios.get(process.env.M3U8_SOURCE);
  return response.data.split("\n");
};

// Show stuff...

app.get("/list_channels", async (request, response) => {
  const channels = await db.Channel.findAll()
  response.type("text")
  response.send(channels)
});


app.get("/list_active_channels", async (request, response) => {
  const channels = await db.Channel.findAll({
    where: {active: {[Op.eq]: true}}
  })
  response.type("text")
  response.send(channels)
});

app.get("/set_active/:channelId", async (request, response) => {
  const channelId = request.params.channelId
  await set_active(channelId, true)
  response.type("json")
  response.send({"ok": true})
})

app.get("/set_inactive/:channelId", async (request, response) => {
  const channelId = request.params.channelId
  await set_active(channelId, false)
  response.type("json")
  response.send({"ok": true})
})

const set_active = async (id, active) => {
  return await db.Channel.update(
    {active},
    {
      where: { id }
    }
  ) 
} 

app.get("/filtered_m3u8", async (request, response) => {
  const m3u8_content = ["#EXTM3U"]
  const channels = await db.Channel.findAll({
    where: {active: {[Op.eq]: true}}
  })
  
  for (let i in channels) {
    let channel = channels[i]
    m3u8_content.push(`EXTINF:-1 tvg-id="" tvg-name="" tvg-url="" group-title="",${channel.name}`)
    m3u8_content.push(channel.url)
  }
    
  response.type("text")
  response.setHeader("content-type", "audio/x-mpegurl")
  response.setHeader('Content-disposition', 'attachment; filename=list.m3u8');
  response.send(m3u8_content.join("\n"))
})

// listen for requests :)
const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
