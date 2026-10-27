import CoreMIDI
import Foundation

/// Связь с модулем через CoreMIDI. Bluetooth MIDI на iPad тоже идёт через CoreMIDI:
/// после подключения в системном окне Bluetooth модуль появляется как обычное MIDI-устройство «V31».
final class MidiLink {
    /// События для интерфейса: ["type": "connected" | "closed" | "error" | "midi" | ...]
    var onEvent: (([String: Any]) -> Void)?

    private var client = MIDIClientRef()
    private var inPort = MIDIPortRef()
    private var outPort = MIDIPortRef()
    private var source: MIDIEndpointRef = 0
    private var destination: MIDIEndpointRef = 0
    private(set) var connectedName: String?

    // сборка SysEx, который может приходить кусками
    private var sysex: [UInt8] = []
    private var inSysex = false
    private var running: UInt8 = 0
    private var msg: [UInt8] = []

    init() {
        MIDIClientCreateWithBlock("V31 Pult" as CFString, &client) { [weak self] notification in
            let id = notification.pointee.messageID
            if id == .msgSetupChanged || id == .msgObjectRemoved {
                DispatchQueue.main.async { self?.checkStillThere() }
            }
        }
        MIDIOutputPortCreate(client, "out" as CFString, &outPort)
        MIDIInputPortCreateWithBlock(client, "in" as CFString, &inPort) { [weak self] list, _ in
            self?.receive(list)
        }
    }

    // MARK: - Поиск модуля

    private static func name(of obj: MIDIObjectRef) -> String {
        var cf: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(obj, kMIDIPropertyDisplayName, &cf) == noErr, let s = cf?.takeRetainedValue() {
            return s as String
        }
        if MIDIObjectGetStringProperty(obj, kMIDIPropertyName, &cf) == noErr, let s = cf?.takeRetainedValue() {
            return s as String
        }
        return ""
    }

    /// Все источники и приёмники, у которых в имени есть «V31».
    private func findV31() -> (MIDIEndpointRef, MIDIEndpointRef, String)? {
        var src: MIDIEndpointRef = 0, dst: MIDIEndpointRef = 0
        var foundName = ""
        for i in 0..<MIDIGetNumberOfSources() {
            let e = MIDIGetSource(i)
            let n = MidiLink.name(of: e)
            if n.uppercased().contains("V31") { src = e; foundName = n; break }
        }
        for i in 0..<MIDIGetNumberOfDestinations() {
            let e = MIDIGetDestination(i)
            let n = MidiLink.name(of: e)
            if n.uppercased().contains("V31") { dst = e; if foundName.isEmpty { foundName = n }; break }
        }
        if src == 0 || dst == 0 { return nil }
        return (src, dst, foundName)
    }

    /// Список всех MIDI-устройств — для сообщения об ошибке.
    func describeEndpoints() -> String {
        var names: [String] = []
        for i in 0..<MIDIGetNumberOfDestinations() { names.append(MidiLink.name(of: MIDIGetDestination(i))) }
        return names.isEmpty ? "MIDI-устройств не найдено" : "Найдены: " + names.joined(separator: ", ")
    }

    @discardableResult
    func connect(kind: String) -> Bool {
        close(byUser: true)
        guard let found = findV31() else { return false }
        source = found.0
        destination = found.1
        let n = found.2
        connectedName = n
        MIDIPortConnectSource(inPort, source, nil)
        onEvent?(["type": "connected", "name": n, "kind": kind == "usb" ? "USB" : "Bluetooth"])
        return true
    }

    func close(byUser: Bool) {
        let wasOpen = source != 0
        if source != 0 { MIDIPortDisconnectSource(inPort, source) }
        source = 0
        destination = 0
        connectedName = nil
        if wasOpen && !byUser { onEvent?(["type": "closed"]) }
    }

    private func checkStillThere() {
        guard source != 0 else { return }
        var stillThere = false
        for i in 0..<MIDIGetNumberOfSources() where MIDIGetSource(i) == source { stillThere = true }
        if !stillThere { close(byUser: false) }
    }

    // MARK: - Отправка

    func send(_ bytes: [UInt8]) {
        guard destination != 0, !bytes.isEmpty else { return }
        let size = 1024
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<MIDIPacketList>.alignment)
        defer { buffer.deallocate() }
        let list = buffer.bindMemory(to: MIDIPacketList.self, capacity: 1)
        var packet = MIDIPacketListInit(list)
        bytes.withUnsafeBufferPointer { p in
            packet = MIDIPacketListAdd(list, size, packet, 0, bytes.count, p.baseAddress!)
        }
        let err = MIDISend(outPort, destination, list)
        if err != noErr {
            onEvent?(["type": "error", "message": "Ошибка отправки MIDI (\(err))"])
        }
    }

    // MARK: - Приём

    private func receive(_ list: UnsafePointer<MIDIPacketList>) {
        var out: [[UInt8]] = []
        let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data) ?? 10
        for packet in list.unsafeSequence() {
            let count = Int(packet.pointee.length)
            let start = UnsafeRawPointer(packet).advanced(by: dataOffset).assumingMemoryBound(to: UInt8.self)
            frame(Array(UnsafeBufferPointer(start: start, count: count)), into: &out)
        }
        guard !out.isEmpty else { return }
        DispatchQueue.main.async {
            for m in out {
                self.onEvent?(["type": "midi", "hex": m.map { String(format: "%02X", $0) }.joined(separator: " ")])
            }
        }
    }

    /// Собирает поток байтов в целые сообщения.
    private func frame(_ data: [UInt8], into out: inout [[UInt8]]) {
        for b in data {
            if b >= 0xF8 { out.append([b]); continue }
            if b == 0xF0 { inSysex = true; sysex = [b]; continue }
            if b == 0xF7 {
                if inSysex { sysex.append(b); out.append(sysex) }
                inSysex = false
                sysex = []
                continue
            }
            if b & 0x80 != 0 {
                inSysex = false
                running = b
                msg = [b]
                if dataLength(b) == 0 { out.append([b]); running = 0 }
                continue
            }
            if inSysex { sysex.append(b); continue }
            if running == 0 { continue }
            if msg.isEmpty { msg = [running] }
            msg.append(b)
            if msg.count == 1 + dataLength(running) {
                out.append(msg)
                msg = []
                if running >= 0xF0 { running = 0 }
            }
        }
    }

    private func dataLength(_ status: UInt8) -> Int {
        let hi = status & 0xF0
        if hi == 0xC0 || hi == 0xD0 { return 1 }
        if hi >= 0x80 && hi <= 0xE0 { return 2 }
        if status == 0xF1 || status == 0xF3 { return 1 }
        if status == 0xF2 { return 2 }
        return 0
    }
}
