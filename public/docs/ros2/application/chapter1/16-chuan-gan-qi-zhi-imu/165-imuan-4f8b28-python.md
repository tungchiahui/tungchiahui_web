### 1.7.5 IMU案例\(Python\)

#### 1.源文件

功能包py04\_imu的py04\_imu目录下，新建Python文件imu\_tf.py，并编辑文件，输入如下内容：

```py
"""  
    需求：订阅机器人的imu消息，以坐标变换的方式发布机器人相对于其质心在地面投影的姿态。
    流程：
        1.导包；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建坐标变换广播器；
          3-2.创建imu消息订阅方，在回调函数中解析数据并发布坐标变换。            
        4.调用spin函数，并传入节点对象；
        5.资源释放。 


"""
# 1.导包；
import rclpy
from rclpy.node import Node
from tf2_ros import TransformBroadcaster
from sensor_msgs.msg import Imu
from geometry_msgs.msg import TransformStamped

# 3.自定义节点类；
class ImuTf(Node):
    def __init__(self):
        super().__init__("imu_tf_node_py")
        # 3-1.创建坐标变换广播器；
        self.broadcaster = TransformBroadcaster(self)
        # 3-2.创建imu消息订阅方，在回调函数中解析数据并发布坐标变换。
        self.imu_sub = self.create_subscription(Imu,"imu",self.imu_cb,10)

    def imu_cb(self,imu):
        # 组织坐标变换消息
        ts = TransformStamped()
        ts.header.frame_id = "world"
        ts.header.stamp = self.get_clock().now().to_msg()

        ts.child_frame_id = "mycar"

        ts.transform.translation.z = 0.5
        ts.transform.rotation = imu.orientation
        # 广播消息
        self.broadcaster.sendTransform(ts)
def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(ImuTf())
    # 5.资源释放。 
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

##### 1.package.xml {#1packagexml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclpy</depend>
<depend>sensor_msgs</depend>
<depend>tf2_ros</depend>
<depend>geometry_msgs</depend>
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
    'console_scripts': [
        'imu_tf = py04_imu.imu_tf:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py04_imu
```

#### 4.执行

请先按照之前介绍，启动机器人底盘以及键盘控制节点。

然后在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py04_imu imu_tf
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为world，并添加tf插件以显示坐标系相对关系，当机器人姿态发生改变时，rviz2中的坐标系相对关系会随之而改变。

