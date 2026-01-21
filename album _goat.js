const axios = require("axios");
const FormData = require("form-data");
const url = require("url");
const path = require("path");

function toBold(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    if (code >= 65 && code <= 90) {
      result += String.fromCodePoint(0x1D400 + (code - 65));
    } else if (code >= 97 && code <= 122) {
      result += String.fromCodePoint(0x1D41A + (code - 97));
    } else if (code >= 48 && code <= 57) {
      result += String.fromCodePoint(0x1D7CE + (code - 48));
    } else {
      result += ch;
    }
  }
  return result;
}

async function uploadToCatbox(mediaUrl, attachmentType) {
  const mediaBuffer = (await axios.get(mediaUrl, { responseType: "arraybuffer" })).data;

  // Determine extension
  let ext;
  if (attachmentType && attachmentType.includes("video")) ext = ".mp4";
  else ext = path.extname(url.parse(mediaUrl).pathname) || ".mp4";

  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("userhash", "");
  form.append("fileToUpload", mediaBuffer, { filename: "upload" + ext });

  const upload = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: {
      ...form.getHeaders(),
      "accept": "application/json",
      "origin": "https://catbox.moe",
      "referer": "https://catbox.moe/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/137 Safari/537.36"
    },
    maxBodyLength: Infinity,
    timeout: 180000
  });

  let catboxUrl = upload.data.trim();

  if (!catboxUrl.startsWith("https://")) {
    throw new Error("Catbox upload failed: " + catboxUrl);
  }

  // Force mp4 extension
  catboxUrl = catboxUrl.replace(/\.video$/, ".mp4");

  return catboxUrl;
}

module.exports = {
  config: {
    name: "album",
    aliases: ["al"],
    version: "2.5",
    author: "MR᭄﹅ MAHABUB﹅ メꪜ",
    countDown: 5,
    role: 0,
    shortDescription: "Smart Album System",
    longDescription: "Add videos by selecting categories from a list",
    category: "utility",
    guide: "{pn} | reply video with {pn} add | {pn} add <url>"
  },

  onStart: async function ({ message, event, api, args }) {
    const BASE_API = "http://72.62.241.211:6788";

    // --- Add video process ---
    if (args[0] === "add") {
      let videoUrl = args[1];

      // If replied to a video
      if (event.type === "message_reply") {
        const attachment = event.messageReply.attachments[0];
        if (attachment) {
          videoUrl = attachment.url;
        }
      }

      if (!videoUrl) return message.reply(toBold("❌ Please reply to a video or provide a URL!"));

      try {
        const res = await axios.get(`${BASE_API}/api/upload`);
        const categories = res.data.availableCategories;

        let msg = "╭─────────────╼\n" +
                  "│  📂 SELECT CATEGORY\n" +
                  "╰─────────────╼\n\n";

        categories.forEach((cat, index) => {
          msg += `  ${index + 1}.  ${cat.category.toUpperCase()}\n`;
        });

        msg += `\n╼───────────────╼\n` +
               `  💡 Reply with the number where\n` +
               `  you want to add this video.`;

        return message.reply(toBold(msg), (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "add_video",
            videoUrl: videoUrl,
            categories: categories,
            author: event.senderID
          });
        });
      } catch (err) {
        return message.reply(toBold("❌ Could not fetch categories."));
      }
    }

    // --- View album list ---
    if (!args[0]) {
      try {
        const res = await axios.get(`${BASE_API}/api/upload`);
        const categories = res.data.availableCategories;

        let msg = "╭─────────────╼\n" +
                  "│  🎬 AVAILABLE ALBUMS\n" +
                  "╰─────────────╼\n\n";

        categories.forEach((cat, index) => {
          msg += `  ${index + 1}.  ${cat.category.toUpperCase()} 「${cat.totalVideos}」\n`;
        });

        msg += `\n╼───────────────╼\n  💡 Reply number to get video.`;

        return message.reply(toBold(msg), (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "view_video",
            messageID: info.messageID,
            categories: categories,
            author: event.senderID
          });
        });
      } catch (err) {
        return message.reply(toBold("❌ Error loading list."));
      }
    }
  },

  onReply: async function ({ message, event, api, Reply }) {
    const { type, categories, videoUrl, messageID, author } = Reply;
    if (event.senderID !== author) return;

    const index = parseInt(event.body);
    const BASE_API = "http://72.62.241.211:6788";

    if (isNaN(index) || index <= 0 || index > categories.length) return;

    const selectedCategory = categories[index - 1].category;

    // --- Add video ---
    if (type === "add_video") {
      try {
        message.reply(toBold(`🔄 Uploading to Catbox...`));

        // Upload to Catbox
        const catboxUrl = await uploadToCatbox(videoUrl, "video");

        // Send to your API
        const res = await axios.get(`${BASE_API}/api/upload/${selectedCategory}?url=${encodeURIComponent(catboxUrl)}`);

        if (res.data.status) {
          return message.reply(toBold(`✅ Successfully added!\n📂 Album: ${selectedCategory}\n📊 Total: ${res.data.totalVideos}\n🔗 Catbox: ${catboxUrl}`));
        } else {
          return message.reply(toBold("❌ Upload failed."));
        }
      } catch (err) {
        return message.reply(toBold("❌ API Error."));
      }
    }

    // --- View video ---
    if (type === "view_video") {
      try {
        await api.editMessage(toBold("⏳ Preparing..."), messageID);
        const res = await axios.get(`${BASE_API}/api/${selectedCategory}`);

        if (!res.data.status) return api.editMessage(toBold("❌ No video found!"), messageID);

        await api.editMessage(toBold("🔄 Sending..."), messageID);

        await message.reply({
          body: toBold(`🎬 Category: ${selectedCategory.toUpperCase()}`),
          attachment: await global.utils.getStreamFromURL(res.data.video)
        });

        return api.editMessage(toBold("✨ Enjoy your video!"), messageID);
      } catch (err) {
        return api.editMessage(toBold("❌ Error!"), messageID);
      }
    }
  }
};
