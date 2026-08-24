### 1.5.5 单线激光雷达仿真\(Python\)

#### 1.发布方实现

功能包py01\_laser的py01\_laser目录下，新建Python文件sim\_laser\_py.py，并编辑文件，输入如下内容：

```py
"""  
    需求：雷达仿真，发布雷达消息。
    流程：
        1.导包；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建发布方；
          3-2.创建定时器；
          3-3.组织消息并发布。          
        4.调用spin函数，并传入节点对象；
        5.资源释放。 
"""
# 1.导包；
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan

# 3.自定义节点类；
class LaserPublisher(Node):
    def __init__(self):
        super().__init__("laser_publisher_py")
        # 3-1.创建发布方；
        self.publisher = self.create_publisher(LaserScan,"scan",10)
        # 3-2.创建定时器；
        self.radius = 3.0
        self.timer = self.create_timer(0.5,self.timer_callback)

    def timer_callback(self):
        num_readings = 120 # 转一圈采集个点
        laser_frequency = 5.0
        # 3-3.组织消息并发布。
        msg = LaserScan()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = "laser"
        msg.angle_min = -3.141
        msg.angle_max = 3.14
        msg.angle_increment = 6.28 / num_readings
        msg.time_increment = 1 / laser_frequency / num_readings
        msg.range_min = 0.15
        msg.range_max = 12.0

        for reading in range(num_readings):
            msg.ranges.append(self.radius)
            msg.intensities.append(100)

        if self.radius >= msg.range_min + 0.2:
            self.radius -= 0.05 

        # 发布
        self.publisher.publish(msg)

def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(LaserPublisher())
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
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
    'console_scripts': [
        'sim_laser_py = py01_laser.sim_laser_py:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py01_laser
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py01_laser sim_laser_py
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为laser，添加雷达消息插件并将话题设置为laser，最终运行结果与演示案例类似。

