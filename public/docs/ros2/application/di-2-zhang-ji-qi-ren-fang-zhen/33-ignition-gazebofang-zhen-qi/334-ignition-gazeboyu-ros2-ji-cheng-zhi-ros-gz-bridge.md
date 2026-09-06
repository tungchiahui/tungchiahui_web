### 3.3.3 Ignition Gazebo与ROS2集成之ros\_gz\_bridge

ros\_gz\_bridge是连接ROS2与Ignition Gazebo的桥梁，ROS2与Ignition Gazebo使用的消息并不兼容，必须通过ros\_gz\_bridge进行转换。

#### 1.ros\_gz\_bridge使用语法

ROS2与Ignition Gazebo的桥接是通过ros\_gz\_bridge包中的parameter\_bridge节点实现，其使用语法如下：

```
parameter_bridge [<topic@ROS2_type@Ign_type> ..]  [<service@ROS2_srv_type[@Ign_req_type@Ign_rep_type]> ..]
```

在话题中，第一个@符号是话题名称和消息类型的分隔符。第一个@符号后面是ROS消息类型。ROS消息类型后面是@、\[或\]符号：

* @表示双向桥接；
* \[表示从Ignition Gazebo到ROS的桥接；
* \]表示从ROS到Ignition Gazebo的桥接。

方向符号后是Gazebo Transport消息类型。

在服务中，第一个@符号是服务名称和类型的分隔符。第一个@符号后面是ROS服务类型。可以选择地包括Gazebo请求和响应类型，在它们之间用@符号分隔。仅支持将Gazebo服务公开为ROS服务，即ROS服务将请求转发到Gazebo服务，然后将响应转发回ROS客户端。

双向桥接示例：

```
parameter_bridge /chatter@std_msgs/String@gz.msgs.StringMsg
```

从Gazebo到ROS的桥接示例：

```
parameter_bridge /chatter@std_msgs/String[gz.msgs.StringMsg
```

从ROS到Gazebo的桥接示例：

```
parameter_bridge /chatter@std_msgs/String]gz.msgs.StringMsg
```

服务桥接示例：

```
parameter_bridge /world/default/control@ros_gz_interfaces/srv/ControlWorld
或者：
parameter_bridge /world/default/control@ros_gz_interfaces/srv/ControlWorld@gz.msgs.WorldControl@gz.msgs.Boolean
```

也可以运行`ros2 run ros_gz_bridge parameter_bridge -h`指令查看官方说明文档。

#### 2.ros\_gz\_bridge支持的消息类型

以下是ROS2与Ignition Gazebo中话题消息类型对应表：

| **ROS2消息类型** | **Gazebo Transport 类型** |
| :--- | :--- |
| builtin\_interfaces/msg/Time | gz.msgs.Time |
| geometry\_msgs/msg/Point | gz.msgs.Vector3d |
| geometry\_msgs/msg/Pose | gz.msgs.Pose |
| geometry\_msgs/msg/PoseArray | gz.msgs.Pose\_V |
| geometry\_msgs/msg/PoseStamped | gz.msgs.Pose |
| geometry\_msgs/msg/PoseWithCovariance | gz.msgs.PoseWithCovariance |
| geometry\_msgs/msg/Quaternion | gz.msgs.Quaternion |
| geometry\_msgs/msg/Transform | gz.msgs.Pose |
| geometry\_msgs/msg/TransformStamped | gz.msgs.Pose |
| geometry\_msgs/msg/Twist | gz.msgs.Twist |
| geometry\_msgs/msg/TwistWithCovariance | gz.msgs.TwistWithCovariance |
| geometry\_msgs/msg/TwistWithCovarianceStamped | gz.msgs.TwistWithCovariance |
| geometry\_msgs/msg/Vector3 | gz.msgs.Vector3d |
| geometry\_msgs/msg/Wrench | gz.msgs.Wrench |
| geometry\_msgs/msg/WrenchStamped | gz.msgs.Wrench |
| nav\_msgs/msg/Odometry | gz.msgs.Odometry |
| nav\_msgs/msg/Odometry | gz.msgs.OdometryWithCovariance |
| rcl\_interfaces/msg/ParameterValue | gz.msgs.Any |
| ros\_gz\_interfaces/msg/Altimeter | gz.msgs.Altimeter |
| ros\_gz\_interfaces/msg/Contact | gz.msgs.Contact |
| ros\_gz\_interfaces/msg/Contacts | gz.msgs.Contacts |
| ros\_gz\_interfaces/msg/Dataframe | gz.msgs.Dataframe |
| ros\_gz\_interfaces/msg/Entity | gz.msgs.Entity |
| ros\_gz\_interfaces/msg/Float32Array | gz.msgs.Float\_V |
| ros\_gz\_interfaces/msg/GuiCamera | gz.msgs.GUICamera |
| ros\_gz\_interfaces/msg/JointWrench | gz.msgs.JointWrench |
| ros\_gz\_interfaces/msg/Light | gz.msgs.Light |
| ros\_gz\_interfaces/msg/SensorNoise | gz.msgs.SensorNoise |
| ros\_gz\_interfaces/msg/StringVec | gz.msgs.StringMsg\_V |
| ros\_gz\_interfaces/msg/TrackVisual | gz.msgs.TrackVisual |
| ros\_gz\_interfaces/msg/VideoRecord | gz.msgs.VideoRecord |
| ros\_gz\_interfaces/msg/WorldControl | gz.msgs.WorldControl |
| rosgraph\_msgs/msg/Clock\* | gz.msgs.Clock\* |
| sensor\_msgs/msg/BatteryState | gz.msgs.BatteryState |
| sensor\_msgs/msg/CameraInfo | gz.msgs.CameraInfo |
| sensor\_msgs/msg/FluidPressure | gz.msgs.FluidPressure |
| sensor\_msgs/msg/Image | gz.msgs.Image |
| sensor\_msgs/msg/Imu | gz.msgs.IMU |
| sensor\_msgs/msg/JointState | gz.msgs.Model |
| sensor\_msgs/msg/Joy | gz.msgs.Joy |
| sensor\_msgs/msg/LaserScan | gz.msgs.LaserScan |
| sensor\_msgs/msg/MagneticField | gz.msgs.Magnetometer |
| sensor\_msgs/msg/NavSatFix | gz.msgs.NavSat |
| sensor\_msgs/msg/PointCloud2 | gz.msgs.PointCloudPacked |
| std\_msgs/msg/Bool | gz.msgs.Boolean |
| std\_msgs/msg/ColorRGBA | gz.msgs.Color |
| std\_msgs/msg/Empty | gz.msgs.Empty |
| std\_msgs/msg/Float32 | gz.msgs.Float |
| std\_msgs/msg/Float64 | gz.msgs.Double |
| std\_msgs/msg/Header | gz.msgs.Header |
| std\_msgs/msg/Int32 | gz.msgs.Int32 |
| std\_msgs/msg/String | gz.msgs.StringMsg |
| std\_msgs/msg/UInt32 | gz.msgs.UInt32 |
| tf2\_msgs/msg/TFMessage | gz.msgs.Pose\_V |
| trajectory\_msgs/msg/JointTrajectory | gz.msgs.JointTrajectory |

以及服务消息类型对应表：

| **ROS2消息类型** | **Gazebo 请求** | **Gazebo 响应** |
| :--- | :--- | :--- |
| ros\_gz\_interfaces/srv/ControlWorld | gz.msgs.WorldControl | gz.msgs.Boolean |



