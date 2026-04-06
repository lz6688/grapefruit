import { type ServerType } from "@hono/node-server";
import { Server } from "socket.io";

import { manager, parse, connect } from "./session.ts";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.ts";
import { attachR2 } from "./r2ws.ts";

export default function attach(server: ServerType) {
  // 创建 Socket.IO 实例，绑定到已有的 HTTP 服务器
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server);

  function onDeviceChange() {
    console.debug("Device manager changed, notifying clients");
    // 通知所有连接到 /devices 命名空间的客户端设备列表发生了变化
    io.of("/devices").emit("change");
  }

  // 监听设备管理器的变化事件，当设备列表发生变化时通知客户端
  manager.changed.connect(onDeviceChange);
  // 在服务器关闭时断开事件监听，避免内存泄漏
  server.on("close", () => {
    manager.changed.disconnect(onDeviceChange);
  });

  // 为设备管理相关的 WebSocket 连接创建一个命名空间
  io.of("/devices");
  // 为会话相关的 WebSocket 连接创建一个命名空间，并处理连接事件
  io.of("/session").on("connection", (socket) => {
    const handshakeParams = {
      ...(socket.handshake.query ?? {}),
      ...(socket.handshake.auth ?? {}),
    };
    // 解析连接请求中的查询参数，建立会话连接
    const params = parse(handshakeParams);
    if (params) {
      // 尝试建立会话连接，如果失败则断开连接并记录错误
      connect(socket, params).catch((ex) => {
        console.error("failed to establish session, ", ex);
        socket.disconnect(true);
      });
    } else {
      console.error("invalid params:", handshakeParams);
      socket.emit("invalid");
      // Give client time to receive the event before disconnecting
      setTimeout(() => socket.disconnect(true), 100);
    }
  });

  attachR2(io);

  return io;
}
