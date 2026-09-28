# Nexus Operations

Monitoring context for a simulated fleet of environmental devices in data-centre style sites.
An operator watches fleet health live, triages alerts, and drills into one device.

## Language

### Fleet

**Fleet**:
All 10,000 simulated devices together.
_Avoid_: system, network, all devices

**Device**:
One physical unit with a stable `deviceId` (`DEV-00001`), a name, a device type and a location, reporting all ten sensor types.
_Avoid_: node, asset, sensor (a device is not a sensor)

**Device type**:
The hardware model family of a device (for example `EnvProbe`, `AirQuality`, `RackMonitor`).
_Avoid_: category, kind

**Sensor type**:
One of the ten measured quantities: temperature, humidity, co2, o2, no2, pm25, pm10, pressure, noise, occupancy.
_Avoid_: metric, channel, KPI

**Location**:
The path `site > floor > zone > room > rack` that places a device.
_Avoid_: address, position

**Zone**:
A named area on a floor (A–F); the unit of the heatmap.
_Avoid_: region, area

### Telemetry

**Reading**:
The latest value of one sensor type on one device, with unit, timestamp and reading status.
_Avoid_: datapoint, sample (a sample is a history entry)

**Sample**:
One historic `(timestamp, value)` entry for a device and sensor type, kept in the history ring.
_Avoid_: point, reading

**Threshold**:
The warning and critical bounds (low and/or high) for a sensor type.
_Avoid_: limit, rule (a rule is a P2 user-edited threshold)

**Reading status**:
NORMAL, WARNING or CRITICAL, derived from a reading and its threshold.

**Device status**:
The worst reading status of a device, or OFFLINE when it has not reported within the offline window.
_Avoid_: health (health is the fleet-level view)

**Stale**:
A reading older than the stale window but not yet offline; shown dimmed with its age.
_Avoid_: old, expired

**Tick**:
One simulator step (1 s) that updates a subset of devices and emits one set of frames.

### Operations

**Alert**:
An open condition raised when a reading enters WARNING or CRITICAL (or a device goes OFFLINE), cleared when it returns to NORMAL.
_Avoid_: alarm, incident, notification

**Event**:
An immutable record of a transition (raised, cleared, offline, online); the activity feed lists events.
_Avoid_: log, alert

**Summary**:
The aggregate counts per status, per sensor type and per zone sent every tick and shown in KPIs and charts.

**Snapshot**:
The full current state loaded over JSON on first load and after a reconnect.

**Delta**:
The packed list of devices that changed in one tick.

**Stream hub**:
The in-process fan-out that serializes each tick's frames once and writes them to every SSE connection.

## Relationships

- The **Fleet** has 10,000 **Devices**; each **Device** has exactly ten **Readings**, one per **Sensor type**.
- A **Reading** plus its **Threshold** gives a **Reading status**; the worst of a device's gives its **Device status**.
- A **Reading status** change raises or clears an **Alert** and always writes an **Event**.
- Each **Tick** produces one **Summary**, one **Delta** and zero or more **Alert** changes.

## Flagged ambiguities

- "sensor" was used for both the device and the quantity. Resolved: the unit is a **Device**, the quantity is a **Sensor type**.
- "alert" vs "event": an **Alert** is open state that can be cleared; an **Event** is history that never changes.
