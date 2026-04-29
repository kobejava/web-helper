const SERVICE_UUID = "7d8f0d20-a351-4f8d-9b6b-7d6ea9d8f001";
const CONFIG_UUID = "7d8f0d20-a351-4f8d-9b6b-7d6ea9d8f101";
const STATUS_UUID = "7d8f0d20-a351-4f8d-9b6b-7d6ea9d8f102";

let device;
let server;
let configCharacteristic;
let statusCharacteristic;

const els = {
  support: document.querySelector("#support"),
  ssid: document.querySelector("#ssid"),
  password: document.querySelector("#password"),
  token: document.querySelector("#token"),
  security: document.querySelector("#security"),
  hidden: document.querySelector("#hidden"),
  connect: document.querySelector("#connect"),
  connectAny: document.querySelector("#connectAny"),
  send: document.querySelector("#send"),
  log: document.querySelector("#log")
};

function setSupport(message, isError = false) {
  els.support.textContent = message;
  els.support.classList.toggle("error", isError);
}

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  els.log.textContent += `\n[${stamp}] ${message}`;
  els.log.scrollTop = els.log.scrollHeight;
}

function assertSupported() {
  if (!("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth is not available in this browser. Use Chrome/Edge on Android or desktop.");
  }

  if (!window.isSecureContext) {
    throw new Error("Web Bluetooth requires HTTPS or localhost. Host this page on an HTTPS origin.");
  }
}

function onDisconnected() {
  els.send.disabled = true;
  log("Bluetooth disconnected.");
}

function onStatusChanged(event) {
  const value = event.target.value;
  const text = new TextDecoder().decode(value);
  log(`Status: ${text}`);
}

async function connectBluetooth(useAnyDevice = false) {
  try {
    assertSupported();
    els.connect.disabled = true;
    els.connectAny.disabled = true;
    els.send.disabled = true;

    log(useAnyDevice
      ? "Opening browser Bluetooth chooser without service filter..."
      : "Opening browser Bluetooth chooser with provisioning service filter...");

    device = await navigator.bluetooth.requestDevice(useAnyDevice
      ? {
          acceptAllDevices: true,
          optionalServices: [SERVICE_UUID]
        }
      : {
          filters: [{ services: [SERVICE_UUID] }],
          optionalServices: [SERVICE_UUID]
        });

    device.addEventListener("gattserverdisconnected", onDisconnected);
    log(`Selected: ${device.name || device.id}`);

    server = await device.gatt.connect();
    log("Connected. Loading GATT service...");

    const service = await server.getPrimaryService(SERVICE_UUID);
    configCharacteristic = await service.getCharacteristic(CONFIG_UUID);
    statusCharacteristic = await service.getCharacteristic(STATUS_UUID);

    statusCharacteristic.addEventListener("characteristicvaluechanged", onStatusChanged);
    await statusCharacteristic.startNotifications();

    try {
      const statusValue = await statusCharacteristic.readValue();
      log(`Initial status: ${new TextDecoder().decode(statusValue)}`);
    } catch (error) {
      log(`Status read skipped: ${error.message}`);
    }

    els.send.disabled = false;
    log("Ready to send Wi-Fi credentials.");
  } catch (error) {
    if (useAnyDevice && /service/i.test(error.message)) {
      log("Selected device does not expose the provisioning service. Pick the Windows provisioner device, or check that the Windows agent is advertising.");
    }
    log(`Bluetooth error: ${error.message}`);
  } finally {
    els.connect.disabled = false;
    els.connectAny.disabled = false;
  }
}

async function sendWifi() {
  try {
    if (!configCharacteristic) {
      throw new Error("Bluetooth is not connected.");
    }

    const payload = {
      ssid: els.ssid.value.trim(),
      password: els.password.value,
      security: els.security.value,
      token: els.token.value,
      hidden: els.hidden.checked
    };

    if (!payload.ssid) {
      throw new Error("Wi-Fi SSID is required.");
    }

    if (payload.security !== "open" && (payload.password.length < 8 || payload.password.length > 63)) {
      throw new Error("WPA/WPA2/WPA3 password must be 8 to 63 characters.");
    }

    if (!payload.token) {
      throw new Error("Shared secret is required.");
    }

    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await configCharacteristic.writeValueWithResponse(bytes);
    log("Wi-Fi payload sent.");
  } catch (error) {
    log(`Send error: ${error.message}`);
  }
}

els.connect.addEventListener("click", () => connectBluetooth(false));
els.connectAny.addEventListener("click", () => connectBluetooth(true));
els.send.addEventListener("click", sendWifi);

if ("bluetooth" in navigator && window.isSecureContext) {
  setSupport("Supported browser detected. Turn on Bluetooth, then connect while the Windows agent is advertising.");
} else if (!window.isSecureContext) {
  setSupport("This page must be served over HTTPS or localhost before Bluetooth will work.", true);
} else {
  setSupport("This browser does not expose Web Bluetooth. Use Chrome/Edge on Android, or a Web BLE browser on iOS.", true);
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
